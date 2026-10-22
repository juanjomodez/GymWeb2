import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/registration.js';

// Simula el proxy HTTPS de Render: la conexión llega en HTTP con X-Forwarded-Proto: https.
async function servidor(t, opciones) {
  const user = { _id: '123', nombre: 'Ana', correo: 'ana@example.com', passwordHash: await hashPassword('clave-de-prueba') };
  const db = {
    async findUserByEmail(email) { return email === user.correo ? user : null; },
    async createSession() {},
    async deleteSession() {},
    async findSessionUser() { return null; },
  };
  const server = createApp(db, opciones).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (origen) => fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', Origin: origen ?? `https://127.0.0.1:${server.address().port}` },
    body: JSON.stringify({ correo: 'ana@example.com', password: 'clave-de-prueba' }),
  });
}

test('detrás del proxy HTTPS la cookie es Secure, hay HSTS y el origen https se acepta', async t => {
  const login = await servidor(t, { trustProxy: 1 });
  const r = await login();
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Secure/);
  assert.match(r.headers.get('strict-transport-security'), /max-age/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await login('https://otro-sitio.example')).status, 403);
});

test('sin proxy de confianza se ignora X-Forwarded-Proto', async t => {
  const login = await servidor(t, {});
  const r = await login();
  // El origen https no coincide con la conexión http real: se rechaza.
  assert.equal(r.status, 403);
});
