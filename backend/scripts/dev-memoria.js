// Servidor de desarrollo con un MongoDB temporal en memoria (no usa Atlas ni .env).
// Los datos se pierden al detenerlo. Uso: npm run dev:memoria [-- --seed]
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createDatabase } from '../src/database.js';
import { crearServicios } from '../src/servicios/index.js';
import { sembrarDemo } from '../src/servicios/demo.servicio.js';
import { mostrarResumenDemo } from './demo-resumen.js';
import { createApp } from '../src/app.js';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const conexion = createDatabase({ uri: replica.getUri(), database: 'GymWeb' });
const database = crearServicios(conexion);
try {
  await database.preparar();
  if (process.argv.includes('--seed')) mostrarResumenDemo(await sembrarDemo(conexion));
} catch (error) {
  await conexion.close();
  await replica.stop();
  throw error;
}
const port = Number(process.env.PORT || 3000);
const server = createApp(database).listen(port, '127.0.0.1', () => {
  console.log(`GymFlow con MongoDB en memoria: http://127.0.0.1:${port}/`);
});
server.on('error', async () => {
  console.error('No se pudo iniciar el servidor HTTP. Revisa que el puerto esté disponible.');
  await conexion.close();
  await replica.stop();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await database.close();
    await replica.stop();
    process.exit(0);
  }));
}
