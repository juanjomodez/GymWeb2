import express, { Router } from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontend = fileURLToPath(new URL('../../../', import.meta.url));
const PAGINAS_PUBLICAS = ['index.html', 'registro.html', 'login.html', 'style.css', 'experiencia.css', 'comun.css', 'cuenta.css', 'web.js'];

export function crearRutasWeb({ requirePagina }) {
  const router = Router();
  const enviar = archivo => (_request, response) => response.sendFile(path.join(frontend, archivo), { dotfiles: 'allow' });

  //pagina privada: sin sesion redirige a /login.html?volver=/micuenta.html
  router.get('/micuenta.html', requirePagina, enviar('micuenta.html'));
  for (const archivo of PAGINAS_PUBLICAS) router.get(`/${archivo}`, enviar(archivo));
  router.get('/', enviar('index.html'));

  // imagenes, texturas y modelos casi no cambian: caché de una semana. El código se revalida (ETag).
  router.use('/img', express.static(path.join(frontend, 'img'), { dotfiles: 'deny', maxAge: '7d' }));
  router.use('/assets', express.static(path.join(frontend, 'assets'), { dotfiles: 'deny', maxAge: '7d' }));
  router.use('/js', express.static(path.join(frontend, 'js'), { dotfiles: 'deny', maxAge: 0 }));
  return router;
}