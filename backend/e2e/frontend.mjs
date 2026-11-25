import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';
import { DEMO, sembrarDemo } from '../src/servicios/demo.servicio.js';
import { crearServicios } from '../src/servicios/index.js';

async function failWhilePending(page, path, method, trigger, control, message, afterPending) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let intercepted;
  const waiting = new Promise(resolve => { intercepted = resolve; });
  const handler = async route => {
    if (route.request().method() !== method) return route.fallback();
    intercepted();
    await gate;
    await route.abort();
  };
  await page.route(path, handler);
  try {
    await trigger();
    await Promise.race([
      waiting,
      page.waitForTimeout(5000).then(() => { throw new Error(`No se recibió ${method} ${path}.`); }),
    ]);
    assert.equal(await control.isDisabled(), true);
    await afterPending?.();
  } finally {
    release();
  }
  await message.waitFor({ state: 'visible' });
  assert.equal(await control.isEnabled(), true);
  await page.unroute(path, handler);
}

async function verificarInterfaz(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/login.html');
  await page.locator('#correo').fill(DEMO.correo);
  await page.locator('#password').fill(DEMO.password);
  const login = page.locator('form button[type=submit]');
  await failWhilePending(page, '**/api/login', 'POST', () => login.click(), login,
    page.getByText('No se pudo contactar con el servidor.', { exact: false }));
  await login.click();
  await page.waitForURL('**/micuenta.html');

  const tab = id => page.locator(`[data-panel="${id}"]`);
  const selected = id => page.locator(`[data-panel="${id}"][aria-selected=true]`).waitFor();
  await selected('membresia');
  await tab('reservas').click();
  await tab('rutinas').click();
  await page.goBack();
  await selected('reservas');
  await page.goForward();
  await selected('rutinas');
  await page.reload();
  await selected('rutinas');
  await tab('rutinas').press('ArrowRight');
  await selected('pedidos');
  await page.goBack();
  await selected('rutinas');
  console.log('Pestañas: Atrás, Adelante, recarga y teclado.');

  const routine = page.getByRole('button', { name: /^Ver rutina / }).first();
  await failWhilePending(page, '**/api/rutinas/*', 'GET', () => routine.click(), routine,
    page.locator('.rutina-detalle').getByText(/Revisa tu conexión/));
  await routine.click();
  await page.locator('.rutina-detalle table').waitFor();

  await tab('perfil').click();
  const save = page.locator('.form-perfil button[type=submit]');
  await page.locator('#perfil-nombre').fill('Nombre de prueba');
  await failWhilePending(page, '**/api/perfil', 'PATCH', () => save.click(), save,
    page.locator('.form-perfil').getByText(/Revisa tu conexión/));
  await save.click();
  await page.locator('.form-perfil').getByText('Perfil actualizado.').waitFor();

  await tab('membresia').click();
  await page.locator('.planes-cuenta button').first().click();
  const payMembership = page.getByRole('button', { name: 'Pagar y activar' });
  await failWhilePending(page, '**/api/membresias', 'POST', () => payMembership.click(), payMembership,
    page.locator('#dialogo-compra').getByText(/Revisa tu conexión/), async () => {
      await page.keyboard.press('Escape');
      assert.equal(await payMembership.isVisible(), true);
    });
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await tab('reservas').click();
  const semana = new Date(Date.now() - 5 * 3600e3 + 24 * 3600e3);
  while ([0, 6].includes(semana.getUTCDay())) semana.setUTCDate(semana.getUTCDate() + 1);
  await page.locator('#reserva-fecha').fill(semana.toISOString().slice(0, 10));
  const hour = page.locator('.lista-horarios label:has(input:enabled)').first();
  await hour.click();
  const book = page.locator('.form-reserva button[type=submit]');
  await failWhilePending(page, '**/api/reservas', 'POST', () => book.click(), book,
    page.locator('.form-reserva').getByText(/Revisa tu conexión/));
  console.log('Mi cuenta: bloqueo, error de red y recuperación en rutinas, perfil, compra y reserva.');

  await page.goto('/index.html#productos', { waitUntil: 'domcontentloaded' });
  const add = page.locator('#productos article button:enabled').first();
  const firstProduct = page.locator('#productos article button').first();
  await failWhilePending(page, '**/api/carrito', 'PUT', () => add.click(), firstProduct,
    page.locator('#productos > .carrito-feedback').getByText(/Revisa tu conexión/));
  await page.getByRole('button', { name: /^Abrir carrito/ }).click();
  const payCart = page.locator('.carrito-pagar');
  let orderCalls = 0;
  await page.route('**/api/pedidos', route => {
    if (route.request().method() === 'POST') orderCalls += 1;
    return route.continue();
  });
  await failWhilePending(page, '**/api/carrito', 'PUT', () => payCart.click(), payCart,
    page.locator('.panel-carrito').getByText(/Revisa tu conexión/));
  assert.equal(orderCalls, 0);
  await payCart.click();
  await page.getByRole('link', { name: 'Ver mis compras' }).waitFor();
  assert.equal(orderCalls, 1);
  assert.deepEqual(errors, []);
  console.log('Tienda: evita pagar un carrito sin guardar y completa el pago tras reintentar.');
}

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const database = createDatabase({ uri: replica.getUri(), database: 'GymFrontendTest' });
let server, browser;
try {
  const servicios = crearServicios(database);
  await servicios.preparar();
  await sembrarDemo(database);
  server = createApp(servicios).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.GYM_BROWSER_CHANNEL });
  const page = await browser.newPage({ baseURL });
  page.setDefaultTimeout(10000);
  // Las pruebas de formularios y navegación solo necesitan recursos del servidor local.
  await page.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.fallback() : route.abort());
  await verificarInterfaz(page);
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await database.close();
  await replica.stop();
}
