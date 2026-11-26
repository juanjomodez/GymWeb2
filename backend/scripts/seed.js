import { config } from '../src/config.js';
import { createDatabase } from '../src/database.js';
import { sembrarDemo } from '../src/servicios/demo.servicio.js';
import { mostrarResumenDemo } from './demo-resumen.js';

const conexion = createDatabase(config);
try {
  if (!config.uri) {
    console.error('Falta MONGODB_URI en backend/.env. Para probar sin Atlas, usa: npm run dev:memoria -- --seed');
    process.exitCode = 1;
  } else {
    mostrarResumenDemo(await sembrarDemo(conexion));
  }
} catch (error) {
  console.error(Number.isInteger(error.status)
    ? error.message
    : 'No se pudieron cargar los datos demo. Revisa la conexión, los permisos y que MongoDB sea un replica set.');
  process.exitCode = 1;
} finally {
  await conexion.close();
}
