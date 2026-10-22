import { config } from './config.js';
import { createDatabase } from './database.js';
import { createApp } from './app.js';

const database = createDatabase(config);
const server = createApp(database, { trustProxy: config.trustProxy }).listen(config.port, config.host, () => {
  console.log(`Backend Gym: http://${config.host}:${config.port}/health`);
  if (!config.uri) console.warn('Falta MONGODB_URI en backend/.env; /health devolverá 503.');
  // Crea colecciones, validadores, índices y catálogo; si Atlas no responde se reintenta en la primera petición.
  else database.preparar().then(
    () => console.log('MongoDB listo: esquema, índices y catálogo verificados.'),
    error => console.warn('MongoDB aún no disponible:', error.message),
  );
});

server.on('error', () => {
  console.error('No se pudo iniciar el servidor HTTP. Revisa HOST y PORT.');
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      try { await database.close(); }
      finally { clearTimeout(timeout); }
    });
  });
}
