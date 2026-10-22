// Pruebas de integración con un MongoDB real en memoria (réplica de un nodo para transacciones).
// La primera ejecución descarga el binario oficial de mongod (mongodb-memory-server).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';

let replica, database, server, base, cliente, db;

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replica.getUri();
  database = createDatabase({ uri, database: 'GymTest' });
  server = createApp(database).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  cliente = new MongoClient(uri);
  db = cliente.db('GymTest');
}, { timeout: 600000 });

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await database.close();
  await cliente.close();
  await replica.stop();
});

// Cliente HTTP con su propia cookie de sesión.
async function nuevaCuenta(correo) {
  let cookie = '';
  const pedir = async (ruta, { metodo = 'GET', cuerpo } = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await pedir('/api/usuarios', { metodo: 'POST', cuerpo: { nombre: 'Prueba', correo, password: 'clave-segura-1' } })).status, 201);
  assert.equal((await pedir('/api/login', { metodo: 'POST', cuerpo: { correo, password: 'clave-segura-1' } })).status, 200);
  return pedir;
}

// Próxima fecha (hora de Cali) en que un entrenador de lunes a viernes atiende, desde mañana.
function proximoDiaHabil() {
  const d = new Date(Date.now() - 5 * 3600e3 + 24 * 3600e3);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('esquema: colecciones con validador, índices clave y catálogo sembrado', async () => {
  await database.preparar();
  const colecciones = await db.listCollections().toArray();
  for (const nombre of ['usuarios', 'sesiones', 'planes', 'membresias', 'entrenadores', 'reservas', 'rutinas', 'productos', 'carritos', 'pedidos', 'maquinas']) {
    assert.ok(colecciones.find(c => c.name === nombre)?.options.validator?.$jsonSchema, `falta validador en ${nombre}`);
  }
  const indices = (await db.collection('reservas').indexes()).map(i => i.name);
  assert.ok(indices.includes('horario_entrenador_unico'));
  assert.ok((await db.collection('membresias').indexes()).some(i => i.name === 'una_activa_por_usuario' && i.unique));
  assert.equal(await db.collection('planes').countDocuments(), 4);
  assert.equal(await db.collection('maquinas').countDocuments(), 10);
  await assert.rejects(db.collection('productos').insertOne({ _id: 'malo', nombre: 'X', precio: -5 }), { code: 121 });
  await assert.rejects(db.collection('usuarios').insertOne({ nombre: 'A', correo: 'MAYUS@x.com', passwordHash: 'x', rol: 'cliente', createdAt: new Date() }), { code: 121 });
});

test('catálogo público y rutinas protegidas', async () => {
  const anonimo = (ruta) => fetch(base + ruta).then(async r => ({ status: r.status, body: await r.json() }));
  assert.equal((await anonimo('/api/planes')).body.planes.length, 4);
  assert.equal((await anonimo('/api/productos')).body.productos.length, 3);
  assert.equal((await anonimo('/api/entrenadores')).body.entrenadores.length, 5);
  const rutinas = await anonimo('/api/rutinas?objetivo=fuerza');
  assert.ok(rutinas.body.rutinas.length >= 1 && rutinas.body.rutinas.every(r => r.objetivo === 'fuerza' && !r.ejercicios));
  assert.equal((await anonimo('/api/rutinas?objetivo=otro')).status, 400);
  assert.equal((await anonimo('/api/rutinas/base-de-fuerza')).status, 401);
  const pedir = await nuevaCuenta('rutinas@example.com');
  const detalle = await pedir('/api/rutinas/base-de-fuerza');
  assert.equal(detalle.status, 200);
  assert.ok(detalle.body.rutina.ejercicios.length > 0);
  assert.equal((await pedir('/api/no-existe')).status, 404);
});

test('membresía: compra, extensión, renovación, cambio de plan y vencimiento', async () => {
  const pedir = await nuevaCuenta('membresia@example.com');
  assert.equal((await pedir('/api/membresia')).body.actual, null);
  assert.equal((await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'basico', meses: 2 } })).status, 400);
  assert.equal((await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'oro', meses: 1 } })).status, 404);

  const compra = await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'basico', meses: 1 } });
  assert.equal(compra.status, 201);
  assert.equal(compra.body.membresia.precioPagado, 60000);
  assert.equal(compra.body.membresia.renovacionAutomatica, false);

  const renov = await pedir('/api/membresia', { metodo: 'PATCH', cuerpo: { renovacionAutomatica: true } });
  assert.equal(renov.body.membresia.renovacionAutomatica, true);

  const extension = await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'basico', meses: 3 } });
  assert.equal(extension.body.membresia.precioPagado, 240000);
  assert.equal(extension.body.membresia.pagos.length, 2);
  assert.ok(new Date(extension.body.membresia.fechaFin) - new Date(compra.body.membresia.fechaFin) > 85 * 864e5);

  const cambio = await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'premium', meses: 1 } });
  assert.equal(cambio.body.membresia.plan.incluyeEntrenador, true);
  const estado = await pedir('/api/membresia');
  assert.deepEqual(estado.body.historial.map(m => m.estado).sort(), ['activa', 'reemplazada']);

  // Vence con renovación activa → se renueva sola; sin renovación → queda vencida.
  const id = cambio.body.membresia.id;
  const coleccion = db.collection('membresias');
  const { ObjectId } = await import('mongodb');
  await coleccion.updateOne({ _id: new ObjectId(id) }, { $set: { fechaFin: new Date(Date.now() - 1000), renovacionAutomatica: true } });
  const renovada = (await pedir('/api/membresia')).body.actual;
  assert.ok(new Date(renovada.fechaFin) > new Date());
  assert.equal(renovada.pagos.at(-1).tipo, 'renovacion');
  await coleccion.updateOne({ _id: new ObjectId(id) }, { $set: { fechaFin: new Date(Date.now() - 1000), renovacionAutomatica: false } });
  const vencida = (await pedir('/api/membresia')).body;
  assert.equal(vencida.actual, null);
  assert.equal(vencida.historial.find(m => m.id === id).estado, 'vencida');
  assert.equal((await pedir('/api/membresia', { metodo: 'PATCH', cuerpo: { renovacionAutomatica: true } })).status, 404);
});

test('reservas: requieren Premium, no permiten horarios ocupados y se pueden cancelar', async () => {
  const ana = await nuevaCuenta('ana.reservas@example.com');
  const beto = await nuevaCuenta('beto.reservas@example.com');
  const fecha = proximoDiaHabil();
  const disp = await ana(`/api/entrenadores/carlos-rodriguez/disponibilidad?fecha=${fecha}`);
  assert.equal(disp.status, 200);
  const hueco = disp.body.horarios.find(h => h.disponible);
  assert.equal(hueco.hora, '06:00');

  assert.equal((await ana('/api/reservas', { metodo: 'POST', cuerpo: { entrenadorId: 'carlos-rodriguez', inicio: hueco.inicio } })).status, 403);
  for (const pedir of [ana, beto]) await pedir('/api/membresias', { metodo: 'POST', cuerpo: { planId: 'premium', meses: 1 } });

  const fuera = new Date(`${fecha}T13:00:00-05:00`).toISOString();
  assert.equal((await ana('/api/reservas', { metodo: 'POST', cuerpo: { entrenadorId: 'carlos-rodriguez', inicio: fuera } })).status, 400);

  const reserva = await ana('/api/reservas', { metodo: 'POST', cuerpo: { entrenadorId: 'carlos-rodriguez', inicio: hueco.inicio } });
  assert.equal(reserva.status, 201);
  const choque = await beto('/api/reservas', { metodo: 'POST', cuerpo: { entrenadorId: 'carlos-rodriguez', inicio: hueco.inicio } });
  assert.equal(choque.status, 409);
  const ocupado = (await beto(`/api/entrenadores/carlos-rodriguez/disponibilidad?fecha=${fecha}`)).body.horarios.find(h => h.inicio === hueco.inicio);
  assert.equal(ocupado.disponible, false);

  const lista = await ana('/api/reservas');
  assert.equal(lista.body.reservas[0].entrenador, 'Carlos Rodríguez');
  assert.equal((await beto(`/api/reservas/${reserva.body.reserva.id}`, { metodo: 'DELETE' })).status, 404);
  assert.equal((await ana(`/api/reservas/${reserva.body.reserva.id}`, { metodo: 'DELETE' })).status, 200);
  assert.equal((await beto('/api/reservas', { metodo: 'POST', cuerpo: { entrenadorId: 'carlos-rodriguez', inicio: hueco.inicio } })).status, 201);
});

test('carrito persistente y pedido transaccional con control de stock', async () => {
  const pedir = await nuevaCuenta('tienda@example.com');
  assert.equal((await pedir('/api/carrito', { metodo: 'PUT', cuerpo: { items: [{ productoId: 'falso', cantidad: 1 }] } })).status, 400);
  assert.equal((await pedir('/api/carrito', { metodo: 'PUT', cuerpo: { items: [{ productoId: 'shaker', cantidad: 0 }] } })).status, 400);
  const carrito = await pedir('/api/carrito', { metodo: 'PUT', cuerpo: { items: [{ productoId: 'proteina', cantidad: 2 }, { productoId: 'shaker', cantidad: 1 }] } });
  assert.equal(carrito.body.total, 335000);
  assert.equal((await pedir('/api/carrito')).body.items.length, 2);

  const stockAntes = (await db.collection('productos').findOne({ _id: 'proteina' })).stock;
  const pedido = await pedir('/api/pedidos', { metodo: 'POST' });
  assert.equal(pedido.status, 201);
  assert.equal(pedido.body.pedido.total, 335000);
  assert.equal((await db.collection('productos').findOne({ _id: 'proteina' })).stock, stockAntes - 2);
  assert.equal((await pedir('/api/carrito')).body.items.length, 0);
  assert.equal((await pedir('/api/pedidos', { metodo: 'POST' })).status, 400);
  assert.equal((await pedir('/api/pedidos')).body.pedidos.length, 1);

  // Sin stock suficiente la transacción se revierte entera (el shaker no se descuenta).
  await db.collection('productos').updateOne({ _id: 'creatina' }, { $set: { stock: 1 } });
  const shakerAntes = (await db.collection('productos').findOne({ _id: 'shaker' })).stock;
  await pedir('/api/carrito', { metodo: 'PUT', cuerpo: { items: [{ productoId: 'shaker', cantidad: 1 }, { productoId: 'creatina', cantidad: 2 }] } });
  assert.equal((await pedir('/api/pedidos', { metodo: 'POST' })).status, 409);
  assert.equal((await db.collection('productos').findOne({ _id: 'shaker' })).stock, shakerAntes);
  assert.equal((await pedir('/api/carrito')).body.items.length, 2);
});
