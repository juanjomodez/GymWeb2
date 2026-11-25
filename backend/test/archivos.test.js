// Persistencia dual: comprobantes PDF en disco + metadatos en la colección `archivos`, y foto de perfil con UUID y SHA-256.
// Usa un MongoDB real en memoria (réplica de un nodo, para las transacciones) y una carpeta temporal como almacenamiento.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { asegurarEsquema } from '../src/esquema.js';
import { crearDisco } from '../src/almacenamiento/disco.js';
import { datosPedido, dibujarComprobante } from '../src/servicios/comprobantes.js';

const UUID_PDF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;
const UUID_PNG = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let replica, database, server, base, cliente, db, almacenamiento;

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replica.getUri();
  almacenamiento = await mkdtemp(path.join(tmpdir(), 'gymflow-archivos-'));
  database = createDatabase({ uri, database: 'GymArchivos', almacenamiento });
  server = createApp(database).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  cliente = new MongoClient(uri);
  db = cliente.db('GymArchivos');
}, { timeout: 600000 });

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await database.close();
  await cliente.close();
  await replica.stop();
  await rm(almacenamiento, { recursive: true, force: true });
});

// Cliente HTTP con su propia cookie. `crudo: true` devuelve la respuesta sin leer el cuerpo.
async function nuevaCuenta(correo, nombre = 'Prueba Archivos') {
  let cookie = '';
  const pedir = async (ruta, { metodo = 'GET', cuerpo, form, crudo = false, headers = {} } = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: form ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (crudo) return r;
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await pedir('/api/usuarios', { metodo: 'POST', cuerpo: { nombre, correo, password: 'clave-segura-1' } })).status, 201);
  assert.equal((await pedir('/api/login', { metodo: 'POST', cuerpo: { correo, password: 'clave-segura-1' } })).status, 200);
  pedir.cookie = () => cookie;
  return pedir;
}
const subirFoto = (pedir, contenido) => {
  const form = new FormData();
  form.append('foto', new Blob([contenido]), 'mi foto.png');
  return pedir('/api/perfil/foto', { metodo: 'POST', form });
};
const idDeUrl = url => url.split('/').pop();
const usuarioId = async correo => (await db.collection('usuarios').findOne({ correo }))._id;

function proximoDiaHabil() {
  const d = new Date(Date.now() - 5 * 3600e3 + 24 * 3600e3);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('esquema: colección archivos con validador e índices', async () => {
  await database.preparar();
  const info = (await db.listCollections({ name: 'archivos' }).toArray())[0];
  assert.ok(info?.options.validator?.$jsonSchema, 'falta el validador de archivos');
  const indices = await db.collection('archivos').indexes();
  const porOperacion = indices.find(i => i.name === 'archivo_por_operacion');
  assert.deepEqual(porOperacion.key, { modulo: 1, operacion: 1 });
  assert.equal(porOperacion.unique, true);
  assert.ok(indices.some(i => i.name === 'archivos_por_autor'));
  assert.ok(indices.some(i => i.name === 'nombre_uuid_unico' && i.unique));

  const valido = {
    nombre: '0f8fad5b-d9cb-469f-a165-70867728950e.pdf', titulo: 'Comprobante X.pdf', tipo: 'application/pdf', peso: 10,
    ruta: 'comprobantes/0f8fad5b-d9cb-469f-a165-70867728950e.pdf', almacen: 'disco', fecha: new Date(),
    autor: new ObjectId(), modulo: 'pedidos', operacion: 'GF-PRUEBA', sha256: 'a'.repeat(64),
  };
  // Nombre que no es UUID, ruta absoluta o con "..", hash mal formado o módulo desconocido: la base de datos los rechaza.
  for (const cambio of [{ nombre: 'factura.pdf' }, { ruta: '/etc/passwd' }, { ruta: 'comprobantes/../../x.pdf' }, { sha256: 'xyz' }, { modulo: 'otro' }]) {
    await assert.rejects(db.collection('archivos').insertOne({ ...valido, ...cambio }), { code: 121 }, JSON.stringify(cambio));
  }
  await db.collection('archivos').insertOne({ ...valido });
  await assert.rejects(db.collection('archivos').insertOne({ ...valido, nombre: '1f8fad5b-d9cb-469f-a165-70867728950e.pdf' }), { code: 11000 });
  await db.collection('archivos').deleteMany({ operacion: 'GF-PRUEBA' });
});

test('compra de membresía: genera el PDF en disco con nombre UUID y registra sus metadatos', async () => {
  const pedir = await nuevaCuenta('membresia.pdf@example.com', 'Lucía Peñaranda');
  const compra = await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'premium', meses: 3 } });
  assert.equal(compra.status, 201);
  const pago = compra.body.membresia.pagos[0];
  assert.match(pago.comprobante, /^\/api\/archivos\/[a-f0-9]{24}$/);

  const doc = await db.collection('archivos').findOne({ modulo: 'membresias', operacion: pago.referencia });
  assert.match(doc.nombre, UUID_PDF);
  assert.equal(doc.ruta, `comprobantes/${doc.nombre}`);
  assert.equal(doc.almacen, 'disco');
  assert.equal(doc.tipo, 'application/pdf');
  assert.equal(doc.titulo, `Comprobante ${pago.referencia}.pdf`);
  assert.deepEqual(doc.autor, await usuarioId('membresia.pdf@example.com'));
  assert.ok(doc.fecha instanceof Date);

  // Peso y hash corresponden exactamente al fichero escrito en disco.
  const enDisco = await readFile(path.join(almacenamiento, doc.ruta));
  assert.equal(enDisco.subarray(0, 5).toString(), '%PDF-');
  assert.equal(doc.peso, enDisco.length);
  assert.equal(doc.sha256, sha256(enDisco));
  assert.equal(doc.datos.cliente.nombre, 'Lucía Peñaranda');
  // No quedan temporales de la escritura atómica.
  assert.deepEqual((await readdir(path.join(almacenamiento, 'comprobantes'))).filter(n => n.endsWith('.tmp')), []);

  // El historial de la membresía enlaza cada pago con su comprobante.
  const estado = await pedir('/api/membresia');
  assert.equal(estado.body.actual.pagos[0].comprobante, pago.comprobante);
});

test('GET /api/archivos y /api/archivos/:id: lista, ver, descargar y solo para el dueño', async () => {
  const ana = await nuevaCuenta('ana.archivos@example.com');
  const beto = await nuevaCuenta('beto.archivos@example.com');
  assert.equal((await fetch(`${base}/api/archivos`)).status, 401);
  const compra = await ana('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'basico', meses: 1 } });
  const url = compra.body.membresia.pagos[0].comprobante;

  const lista = await ana('/api/archivos');
  assert.equal(lista.status, 200);
  assert.equal(lista.body.archivos.length, 1);
  const archivo = lista.body.archivos[0];
  assert.equal(archivo.url, url);
  assert.equal(archivo.descarga, `${url}?descargar=1`);
  assert.equal(archivo.modulo, 'membresias');
  assert.match(archivo.nombre, UUID_PDF);
  assert.match(archivo.sha256, /^[a-f0-9]{64}$/);
  assert.equal(archivo.ruta, undefined, 'la ruta interna no se expone');
  assert.equal(archivo.datos, undefined);
  assert.equal((await ana('/api/archivos?modulo=pedidos')).body.archivos.length, 0);
  assert.equal((await ana('/api/archivos?modulo=otro')).status, 400);

  const ver = await ana(url, { crudo: true });
  assert.equal(ver.status, 200);
  assert.equal(ver.headers.get('content-type'), 'application/pdf');
  assert.match(ver.headers.get('content-disposition'), /^inline; filename="Comprobante GF-[A-F0-9]{10}\.pdf"/);
  assert.equal(ver.headers.get('etag'), `"${archivo.sha256}"`);
  assert.equal(ver.headers.get('repr-digest'), `sha-256=:${Buffer.from(archivo.sha256, 'hex').toString('base64')}:`);
  const pdf = Buffer.from(await ver.arrayBuffer());
  assert.equal(sha256(pdf), archivo.sha256);
  assert.equal(pdf.length, archivo.peso);

  const descarga = await ana(`${url}?descargar=1`, { crudo: true });
  assert.match(descarga.headers.get('content-disposition'), /^attachment; /);
  await descarga.arrayBuffer();

  // Si ya lo tiene en caché (mismo hash), no se reenvía.
  // (con node:http: fetch añade "Cache-Control: no-cache" cuando se envía If-None-Match a mano).
  const estadoCache = await new Promise((resolve, reject) => {
    get(base + url, { headers: { Cookie: ana.cookie(), 'If-None-Match': `"${archivo.sha256}"` } }, r => { r.resume(); resolve(r.statusCode); }).on('error', reject);
  });
  assert.equal(estadoCache, 304);

  // Otro usuario no puede ver ni descargar el archivo (ni saber que existe).
  assert.equal((await beto(url)).status, 404);
  assert.equal((await beto(`${url}?descargar=1`)).status, 404);
  assert.equal((await beto('/api/archivos')).body.archivos.length, 0);
  assert.equal((await ana('/api/archivos/no-es-un-id')).status, 404);
  assert.equal((await ana(`/api/archivos/${'f'.repeat(24)}`)).status, 404);
});

test('cita y pedido: cada operación genera su comprobante, uno solo aunque se pida varias veces', async () => {
  const pedir = await nuevaCuenta('cita.pedido@example.com');
  await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'premium', meses: 1 } });
  const fecha = proximoDiaHabil();
  const entrenadorId = 'carlos-rodriguez';
  const hueco = (await pedir(`/api/entrenadores/${entrenadorId}/disponibilidad?fecha=${fecha}`)).body.horarios.find(h => h.disponible);
  const reserva = await pedir('/api/reservas', { metodo: 'POST', cuerpo: { entrenadorId, inicio: hueco.inicio } });
  assert.equal(reserva.status, 201);
  assert.match(reserva.body.reserva.comprobante, /^\/api\/archivos\/[a-f0-9]{24}$/);
  assert.equal((await pedir('/api/reservas')).body.reservas[0].comprobante, reserva.body.reserva.comprobante);
  const cita = await db.collection('archivos').findOne({ modulo: 'reservas', operacion: reserva.body.reserva.id });
  assert.match(cita.datos.referencia, /^CITA-[A-F0-9]{8}$/);

  await pedir('/api/carrito', { metodo: 'PUT', cuerpo: { items: [{ productoId: 'shaker', cantidad: 2 }] } });
  const pedido = await pedir('/api/pedidos', { metodo: 'POST' });
  assert.equal(pedido.status, 201);
  assert.match(pedido.body.pedido.comprobante, /^\/api\/archivos\/[a-f0-9]{24}$/);
  assert.equal((await pedir('/api/pedidos')).body.pedidos[0].comprobante, pedido.body.pedido.comprobante);

  // Varias peticiones simultáneas no duplican comprobantes (índice único por operación).
  await Promise.all([pedir('/api/archivos'), pedir('/api/archivos'), pedir('/api/membresia'), pedir('/api/archivos')]);
  const autor = await usuarioId('cita.pedido@example.com');
  const docs = await db.collection('archivos').find({ autor }).toArray();
  assert.deepEqual(docs.map(d => d.modulo).sort(), ['membresias', 'pedidos', 'reservas']);
  const ficheros = await readdir(path.join(almacenamiento, 'comprobantes'));
  for (const d of docs) assert.ok(ficheros.includes(d.nombre));
  assert.equal(new Set(docs.map(d => d.operacion)).size, docs.length);
  assert.equal((await pedir('/api/archivos?modulo=reservas')).body.archivos.length, 1);
});

test('integridad: un PDF borrado o alterado en disco se regenera idéntico (mismo SHA-256)', async () => {
  const pedir = await nuevaCuenta('integridad@example.com');
  const compra = await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'familiar', meses: 6 } });
  const url = compra.body.membresia.pagos[0].comprobante;
  const doc = await db.collection('archivos').findOne({ _id: new ObjectId(idDeUrl(url)) });
  const ruta = path.join(almacenamiento, doc.ruta);
  const original = await readFile(ruta);

  // Disco efímero del hosting: el fichero desaparece.
  await rm(ruta);
  const restaurado = await pedir(url, { crudo: true });
  assert.equal(restaurado.status, 200);
  assert.deepEqual(Buffer.from(await restaurado.arrayBuffer()), original);
  assert.deepEqual(await readFile(ruta), original);

  // Alguien modifica el fichero: no se entrega el alterado sino el original verificado.
  await writeFile(ruta, Buffer.concat([original.subarray(0, 200), Buffer.from('ALTERADO'), original.subarray(208)]));
  const verificado = await pedir(url, { crudo: true });
  assert.equal(sha256(Buffer.from(await verificado.arrayBuffer())), doc.sha256);
  assert.equal(sha256(await readFile(ruta)), doc.sha256);

  // Si los datos guardados ya no reproducen el hash, se rechaza en lugar de entregar algo distinto.
  await db.collection('archivos').updateOne({ _id: doc._id }, { $set: { 'datos.total.valor': '$1' } });
  await rm(ruta);
  assert.equal((await pedir(url)).status, 500);
});

test('operaciones anteriores a los comprobantes: se generan al listar los archivos', async () => {
  const pedir = await nuevaCuenta('antiguo@example.com', 'Cliente Antiguo');
  const autor = await usuarioId('antiguo@example.com');
  await db.collection('pedidos').insertOne({
    usuarioId: autor, referencia: 'GF-ANTIGUO001', estado: 'pagado', total: 25000, createdAt: new Date('2026-10-01T15:00:00Z'),
    items: [{ productoId: 'shaker', nombre: 'Shaker', precioUnitario: 25000, cantidad: 1, subtotal: 25000 }],
  });
  assert.equal(await db.collection('archivos').countDocuments({ autor }), 0);
  const lista = (await pedir('/api/archivos')).body.archivos;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].operacion, 'GF-ANTIGUO001');
  assert.equal(lista[0].titulo, 'Comprobante GF-ANTIGUO001.pdf');
});

test('foto de perfil: nombre UUID y SHA-256 en GridFS, en el usuario y en archivos', async () => {
  const pedir = await nuevaCuenta('foto.uuid@example.com');
  const autor = await usuarioId('foto.uuid@example.com');
  assert.equal((await subirFoto(pedir, PNG)).status, 201);

  const { foto } = await db.collection('usuarios').findOne({ _id: autor });
  assert.match(foto.nombre, UUID_PNG);
  assert.equal(foto.sha256, sha256(PNG));
  const gridfs = await db.collection('fotos.files').findOne({ _id: foto.archivoId });
  assert.equal(gridfs.filename, foto.nombre, 'el nombre del usuario ("mi foto.png") no se usa');
  assert.equal(gridfs.metadata.sha256, sha256(PNG));
  const registro = await db.collection('archivos').findOne({ autor, modulo: 'perfil' });
  assert.equal(registro.nombre, foto.nombre);
  assert.equal(registro.sha256, foto.sha256);
  assert.equal(registro.peso, PNG.length);
  assert.equal(registro.almacen, 'gridfs');
  assert.equal(registro.ruta, `fotos/${foto.archivoId}`);

  // La foto se puede abrir como archivo del usuario (verificada) y por su URL pública (con ETag = SHA-256).
  const comoArchivo = await pedir(`/api/archivos/${registro._id}`, { crudo: true });
  assert.equal(comoArchivo.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await comoArchivo.arrayBuffer()), PNG);
  const publica = await fetch(`${base}${foto.url}`);
  assert.equal(publica.headers.get('etag'), `"${sha256(PNG)}"`);
  await publica.arrayBuffer();

  // Al reemplazarla, el registro anterior desaparece junto con su fichero; al borrarla, no queda ninguno.
  assert.equal((await subirFoto(pedir, PNG2)).status, 201);
  const fotos = await db.collection('archivos').find({ autor, modulo: 'perfil' }).toArray();
  assert.equal(fotos.length, 1);
  assert.equal(fotos[0].sha256, sha256(PNG2));
  assert.equal(await db.collection('fotos.files').countDocuments({ _id: foto.archivoId }), 0);
  assert.equal((await pedir('/api/perfil/foto', { metodo: 'DELETE' })).status, 200);
  assert.equal(await db.collection('archivos').countDocuments({ autor, modulo: 'perfil' }), 0);
});

test('migración: fotos subidas antes reciben nombre UUID, SHA-256 y registro en archivos', async () => {
  const pedir = await nuevaCuenta('foto.antigua@example.com');
  const autor = await usuarioId('foto.antigua@example.com');
  const archivoId = new ObjectId();
  await new Promise((resolve, reject) => {
    new GridFSBucket(db, { bucketName: 'fotos' }).openUploadStreamWithId(archivoId, `perfil-${autor}`, { contentType: 'image/png', metadata: { usuarioId: autor, tipo: 'image/png' } })
      .on('finish', resolve).on('error', reject).end(PNG);
  });
  await db.collection('usuarios').updateOne({ _id: autor }, {
    $set: { foto: { archivoId, url: `/api/fotos/${archivoId}`, tipo: 'image/png', tamano: PNG.length, subidaAt: new Date() } },
  });
  await asegurarEsquema(db);
  const { foto } = await db.collection('usuarios').findOne({ _id: autor });
  assert.match(foto.nombre, UUID_PNG);
  assert.equal(foto.sha256, sha256(PNG));
  assert.equal((await db.collection('fotos.files').findOne({ _id: archivoId })).filename, foto.nombre);
  assert.equal((await db.collection('archivos').findOne({ modulo: 'perfil', operacion: `foto-${archivoId}` })).sha256, sha256(PNG));
  // Repetir la preparación no vuelve a migrar ni duplica.
  await asegurarEsquema(db);
  assert.equal(await db.collection('archivos').countDocuments({ autor, modulo: 'perfil' }), 1);
  assert.equal((await pedir('/api/perfil')).body.perfil.fotoUrl, `/api/fotos/${archivoId}`);
});

test('almacenamiento en disco: rutas fuera de la raíz se rechazan y el PDF es determinista', async () => {
  const disco = crearDisco(almacenamiento);
  for (const ruta of ['../fuera.pdf', 'comprobantes/../../fuera.pdf', path.resolve(almacenamiento, 'x.pdf')]) {
    await assert.rejects(disco.leer(ruta), /Ruta de almacenamiento inválida/);
    await assert.rejects(disco.escribir(ruta, Buffer.from('x')), /Ruta de almacenamiento inválida/);
  }
  const guardado = await disco.guardar('comprobantes', 'pdf', Buffer.from('%PDF-prueba'));
  assert.match(guardado.nombre, UUID_PDF);
  assert.equal((await stat(path.join(almacenamiento, guardado.ruta))).size, guardado.peso);
  await disco.eliminar(guardado.ruta);
  assert.equal(await disco.leer(guardado.ruta), null);

  const datos = datosPedido({
    cliente: { nombre: 'Ñandú Pérez', correo: 'n@example.com' },
    pedido: { referencia: 'GF-DETERMINA', createdAt: new Date('2026-11-25T12:00:00Z'), total: 1000, items: [{ nombre: 'Shaker', precioUnitario: 1000, cantidad: 1, subtotal: 1000 }] },
  });
  assert.deepEqual(dibujarComprobante(datos), dibujarComprobante(structuredClone(datos)));
});
