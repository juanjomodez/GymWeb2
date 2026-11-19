import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createDatabase } from '../src/database.js';
import { crearServicios } from '../src/servicios/index.js';
import { DEMO, sembrarDemo } from '../src/servicios/demo.servicio.js';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/registration.js';

const ejecutar = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
let replica, cliente, numero = 0;

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  cliente = await new MongoClient(replica.getUri()).connect();
}, { timeout: 600000 });

after(async () => {
  await cliente.close();
  await replica.stop();
});

async function fixture(t) {
  const nombre = `SeedTest${++numero}`;
  const conexion = createDatabase({ uri: replica.getUri(), database: nombre });
  t.after(() => conexion.close());
  await conexion.preparar();
  return { conexion, nombre, db: cliente.db(nombre), servicios: crearServicios(conexion) };
}

async function estado(db) {
  const colecciones = ['usuarios', 'membresias', 'reservas', 'pedidos'];
  const conteos = await Promise.all(colecciones.map(async nombre => [nombre, await db.collection(nombre).countDocuments()]));
  return { ...Object.fromEntries(conteos), stock: (await db.collection('productos').findOne({ _id: 'shaker' })).stock };
}

function entorno(nombre, uri = replica.getUri()) {
  return { ...process.env, MONGODB_URI: uri, MONGODB_DB: nombre, MONGODB_DNS_SERVERS: '', CORS_ORIGINS: '', PORT: '3000' };
}

test('seed: crea datos relacionados y la cuenta permite login y consultar Mi cuenta', async t => {
  const { conexion, db, servicios } = await fixture(t);
  const resultado = await sembrarDemo(conexion);
  const usuario = await db.collection('usuarios').findOne({ correo: DEMO.correo });
  assert.equal(usuario._id.toString(), DEMO.id);
  assert.equal(usuario.rol, 'cliente');
  assert.equal(usuario.password, undefined);
  assert.equal(await verifyPassword(DEMO.password, usuario.passwordHash), true);
  assert.equal(resultado.membresia.estado, 'activa');
  assert.equal(resultado.membresia.plan.incluyeEntrenador, true);
  assert.ok(new Date(resultado.membresia.fechaFin) > new Date());
  assert.ok(new Date(resultado.reserva.inicio) > new Date());
  assert.equal(resultado.pedido.estado, 'pagado');
  assert.equal(resultado.pedido.items[0].productoId, 'shaker');
  assert.deepEqual(await estado(db), { usuarios: 1, membresias: 1, reservas: 1, pedidos: 1, stock: 99 });

  const server = createApp(servicios).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: DEMO.correo, password: DEMO.password }),
  });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  for (const ruta of ['/api/perfil', '/api/membresia', '/api/reservas', '/api/pedidos', '/micuenta.html']) {
    const respuesta = await fetch(base + ruta, { headers });
    assert.equal(respuesta.status, 200, ruta);
    await respuesta.text();
  }
});

test('seed: repetirlo desde el comando conserva IDs, pagos, stock y cuentas ajenas', async t => {
  const { conexion, db, nombre, servicios } = await fixture(t);
  await servicios.createUser({ nombre: 'Otra cuenta', correo: 'otra@example.com', passwordHash: await hashPassword('otra-clave-123'), createdAt: new Date() });
  const otra = await db.collection('usuarios').findOne({ correo: 'otra@example.com' });
  const primero = await sembrarDemo(conexion);
  const antes = await estado(db);
  const { stdout } = await ejecutar(process.execPath, ['scripts/seed.js'], { cwd: backend, env: entorno(nombre), timeout: 60000 });
  assert.match(stdout, /Datos demo listos/);
  assert.match(stdout, /demo@gymflow\.test/);
  const segundo = await sembrarDemo(conexion);
  assert.deepEqual(await estado(db), antes);
  assert.equal(segundo.membresia.id, primero.membresia.id);
  assert.equal(segundo.membresia.fechaFin.toISOString(), primero.membresia.fechaFin.toISOString());
  assert.equal(segundo.membresia.pagos.length, primero.membresia.pagos.length);
  assert.equal(segundo.reserva.id, primero.reserva.id);
  assert.equal(segundo.pedido.id, primero.pedido.id);
  assert.deepEqual(await db.collection('usuarios').findOne({ _id: otra._id }), otra);
});

test('seed: si no hay stock revierte usuario, membresía y cita del intento', async t => {
  const { conexion, db } = await fixture(t);
  await db.collection('productos').updateMany({}, { $set: { stock: 0 } });
  await assert.rejects(sembrarDemo(conexion), error => error.status === 409 && /stock/.test(error.message));
  assert.deepEqual(await estado(db), { usuarios: 0, membresias: 0, reservas: 0, pedidos: 0, stock: 0 });
  assert.equal(await db.collection('carritos').countDocuments(), 0);
});

test('seed: no adopta una cuenta existente que tenga el correo demo', async t => {
  const { conexion, db, servicios } = await fixture(t);
  await servicios.createUser({ nombre: 'Cuenta existente', correo: DEMO.correo, passwordHash: await hashPassword('otra-clave-123'), createdAt: new Date() });
  const existente = await db.collection('usuarios').findOne({ correo: DEMO.correo });
  await assert.rejects(sembrarDemo(conexion), error => error.status === 409 && /otra cuenta/.test(error.message));
  assert.deepEqual(await db.collection('usuarios').findOne({ correo: DEMO.correo }), existente);
  assert.deepEqual(await estado(db), { usuarios: 1, membresias: 0, reservas: 0, pedidos: 0, stock: 100 });
});

test('seed: conserva una contraseña demo modificada y no vuelve a comprar', async t => {
  const { conexion, db } = await fixture(t);
  await sembrarDemo(conexion);
  const cambiado = await hashPassword('otra-clave-123');
  await db.collection('usuarios').updateOne({ correo: DEMO.correo }, { $set: { passwordHash: cambiado } });
  const antes = await estado(db);
  await assert.rejects(sembrarDemo(conexion), error => error.status === 409 && /credenciales/.test(error.message));
  assert.equal((await db.collection('usuarios').findOne({ correo: DEMO.correo })).passwordHash, cambiado);
  assert.deepEqual(await estado(db), antes);
});

test('seed: dos ejecuciones simultáneas no duplican compras ni descuentos', async t => {
  const { conexion, db } = await fixture(t);
  const [uno, dos] = await Promise.all([sembrarDemo(conexion), sembrarDemo(conexion)]);
  assert.equal(uno.pedido.id, dos.pedido.id);
  assert.equal(uno.reserva.id, dos.reserva.id);
  assert.deepEqual(await estado(db), { usuarios: 1, membresias: 1, reservas: 1, pedidos: 1, stock: 99 });
});

test('seed: sin URI el comando termina con una instrucción de configuración', async () => {
  await assert.rejects(
    ejecutar(process.execPath, ['scripts/seed.js'], { cwd: backend, env: entorno('SinConexion', ''), timeout: 10000 }),
    error => error.code === 1 && /MONGODB_URI/.test(error.stderr) && /dev:memoria -- --seed/.test(error.stderr),
  );
});
