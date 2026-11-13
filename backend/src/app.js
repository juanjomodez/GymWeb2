// Deje armado la aplicacion Express por capas:
import express from 'express';
import compression from 'compression';
import { cabecerasSeguridad, cors, sinCache, verificarOrigen } from './middlewares/seguridad.js';
import { crearAutenticacion } from './middlewares/autenticacion.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/errores.js';
import { crearSaludControlador } from './controladores/salud.controlador.js';
import { crearRutasApi } from './rutas/api.rutas.js';
import { crearRutasWeb } from './rutas/web.rutas.js';

export function createApp(servicios, { trustProxy = 0, corsOrigins = [] } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Con proxy de confianza, request.secure/protocol/ip reflejan al cliente real (cookies Secure, origen, límites).
  if (trustProxy) app.set('trust proxy', trustProxy);
  app.use(compression());
  app.use(cabecerasSeguridad);

  const salud = crearSaludControlador(servicios);
  app.get('/vivo', salud.vivo);
  app.get('/health', salud.salud);

  const autenticacion = crearAutenticacion(servicios);
  app.use(crearRutasWeb(autenticacion));

  app.use('/api', cors(corsOrigins), verificarOrigen(corsOrigins), sinCache, express.json({ limit: '8kb' }));
  app.use('/api', crearRutasApi(servicios, autenticacion));
  app.use('/api', rutaNoEncontrada);

  app.use(manejadorErrores);
  return app;
}