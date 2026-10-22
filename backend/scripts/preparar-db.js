// Crea o actualiza en Atlas las colecciones de GymWeb (validadores e índices) y el catálogo.
// Uso: npm run db:preparar. Es idempotente y no modifica datos de usuarios.
import { config } from '../src/config.js';
import { createDatabase } from '../src/database.js';

const database = createDatabase(config);
try {
  await database.preparar();
  console.log(`Base "${config.database}" lista: colecciones, validadores, índices y catálogo.`);
} catch (error) {
  console.error('No se pudo preparar la base:', error.message);
  process.exitCode = 1;
} finally {
  await database.close();
}
