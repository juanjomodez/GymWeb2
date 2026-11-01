import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/registration.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082', 'hex');

async function fixture(t) {
  const user = { _id: '123', nombre: 'Ana', correo: 'ana@example.com', passwordHash: await hashPassword('clave-de-prueba'), telefono: '', objetivo: '' };
  const sessions = new Map();
  const fotos = new Map();
  const perfil = () => ({ id: user._id, nombre: user.nombre, correo: user.correo, telefono: user.telefono, objetivo: user.objetivo, fotoUrl: user.foto?.url ?? null });
  const db = {
    async findUserByEmail(email) { return email === user.correo ? user : null; },
    async createSession(session) { sessions.set(session._id, session); },
    async deleteSession(hash) { sessions.delete(hash); },
    async findSessionUser(hash) { return sessions.has(hash) ? { id: user._id, nombre: user.nombre, correo: user.correo } : null; },
    async obtenerPerfil() { return perfil(); },
    async actualizarPerfil(_id, cambios) { Object.assign(user, cambios); return perfil(); },
    async guardarFotoPerfil(_id, { buffer, tipo }) {
      const id = String(fotos.size + 1).padStart(24, 'a');
      fotos.set(id, { buffer, tipo });
      user.foto = { url: `/api/fotos/${id}` };
      return perfil();
    },
    async eliminarFotoPerfil() { delete user.foto; },
    async abrirFoto(id) {
      const f = fotos.get(id);
      if (!f) return null;
      const { Readable } = await import('node:stream');
      return { tipo: f.tipo, tamano: f.buffer.length, stream: Readable.from([f.buffer]) };
    },
  };
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: user.correo, password: 'clave-de-prueba' }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const pedir = (ruta, opciones = {}) => fetch(base + ruta, { ...opciones, headers: { Cookie: cookie, ...opciones.headers } });
  const subir = (contenido, nombre = 'foto.png', campo = 'foto') => {
    const datos = new FormData();
    datos.append(campo, new Blob([contenido]), nombre);
    return pedir('/api/perfil/foto', { method: 'POST', body: datos });
  };
  return { base, pedir, subir, fotos };
}

test('editar perfil: valida y guarda nombre, teléfono y objetivo', async t => {
  const { base, pedir } = await fixture(t);
  assert.equal((await fetch(`${base}/api/perfil`)).status, 401);
  const patch = cuerpo => pedir('/api/perfil', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  assert.equal((await patch({ nombre: 'A' })).status, 400);
  assert.equal((await patch({ telefono: 'abc' })).status, 400);
  assert.equal((await patch({ objetivo: 'volar' })).status, 400);
  assert.equal((await patch({})).status, 400);
  const ok = await patch({ nombre: '  Ana María ', telefono: '+57 300 123 4567', objetivo: 'fuerza' });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).perfil, { id: '123', nombre: 'Ana María', correo: 'ana@example.com', telefono: '+57 300 123 4567', objetivo: 'fuerza', fotoUrl: null });
});

test('foto de perfil: multipart, tipo real, tamaño y descarga', async t => {
  const { base, subir, pedir } = await fixture(t);
  assert.equal((await fetch(`${base}/api/perfil/foto`, { method: 'POST', body: new FormData() })).status, 401);
  assert.equal((await pedir('/api/perfil/foto', { method: 'POST', body: new FormData() })).status, 400);
  // Un texto con extensión .png no pasa: se revisan los bytes, no el nombre.
  assert.equal((await subir('<script>alert(1)</script>', 'falsa.png')).status, 415);
  assert.equal((await subir(PNG, 'foto.png', 'otro')).status, 400);
  assert.equal((await subir(Buffer.alloc(2 * 1024 * 1024 + 1), 'grande.png')).status, 413);

  const r = await subir(PNG);
  assert.equal(r.status, 201);
  const { perfil } = await r.json();
  assert.match(perfil.fotoUrl, /^\/api\/fotos\/[a-f0-9]{24}$/);
  const foto = await fetch(base + perfil.fotoUrl);
  assert.equal(foto.status, 200);
  assert.equal(foto.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await foto.arrayBuffer()), PNG);
  assert.equal((await fetch(`${base}/api/fotos/${'b'.repeat(24)}`)).status, 404);
  assert.equal((await fetch(`${base}/api/fotos/no-valido`)).status, 404);

  assert.equal((await pedir('/api/perfil/foto', { method: 'DELETE' })).status, 200);
  assert.equal((await (await pedir('/api/perfil')).json()).perfil.fotoUrl, null);
});
