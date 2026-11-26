// Sesiones con cookie HttpOnly. El token viaja solo en la cookie; MongoDB guarda su SHA-256.
import { createHash } from 'node:crypto';
import { ErrorHttp } from './errores.js';

export const COOKIE_SESION = 'gym_session';
export const DURACION_SESION = 8 * 60 * 60 * 1000;

export const hashToken = token => createHash('sha256').update(token).digest('hex');

export function leerToken(request) {
  const valor = (request.headers.cookie || '').split(';').map(parte => parte.trim())
    .find(parte => parte.startsWith(`${COOKIE_SESION}=`))?.slice(COOKIE_SESION.length + 1);
  return /^[a-f0-9]{64}$/.test(valor || '') ? valor : null;
}

export const opcionesCookie = request => ({ httpOnly: true, sameSite: 'strict', secure: request.secure, path: '/' });

// Devuelve dos middlewares que exigen sesion:
//   requireUser   → para la API: responde 401 en JSON.
//   requirePagina → para paginas HTML privadas: redirige al login y vuelve despues.
export function crearAutenticacion(servicios) {
  async function usuarioDeSesion(request, response) {
    const token = leerToken(request);
    let usuario;
    try {
      usuario = token ? await servicios.findSessionUser(hashToken(token)) : null;
    } catch {
      throw new ErrorHttp(503, 'No se pudo comprobar la sesión. Intenta más tarde.');
    }
    if (!usuario) response.clearCookie(COOKIE_SESION, opcionesCookie(request));
    return usuario;
  }

  async function requireUser(request, response, next) {
    try {
      const usuario = await usuarioDeSesion(request, response);
      if (!usuario) throw new ErrorHttp(401, 'Inicia sesión para continuar.');
      request.user = usuario;
      response.set('Cache-Control', 'no-store');
      next();
    } catch (error) {
      next(error);
    }
  }

  async function requirePagina(request, response, next) {
    try {
      const usuario = await usuarioDeSesion(request, response);
      if (!usuario) return response.redirect(`/login.html?volver=${encodeURIComponent(request.originalUrl)}`);
      request.user = usuario;
      response.set('Cache-Control', 'no-store');
      next();
    } catch (error) {
      next(error);
    }
  }

  return { requireUser, requirePagina, usuarioDeSesion };
}