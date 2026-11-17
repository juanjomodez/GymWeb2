// Conexión MongoDB, preparación inicial y límites de las transacciones.
// Las consultas viven en repositorios/ y las reglas de negocio en servicios/.
import { MongoClient } from 'mongodb';
import { asegurarEsquema } from './esquema.js';
import { sembrarCatalogo } from './catalogo.js';

export function createDatabase({ uri, database }) {
  let client;
  let preparado;

  function getDb() {
    if (!uri) throw new Error('MONGODB_URI no configurada');
    client ??= new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
      socketTimeoutMS: 10000, timeoutMS: 10000,
    });
    return client.db(database);
  }

  async function db() {
    const base = getDb();
    preparado ??= asegurarEsquema(base).then(() => sembrarCatalogo(base)).catch(error => {
      preparado = undefined;
      throw error;
    });
    await preparado;
    return base;
  }

  async function transaccion(fn) {
    const base = await db();
    const sesion = client.startSession();
    try {
      let resultado;
      await sesion.withTransaction(async () => { resultado = await fn(base, sesion); });
      return resultado;
    } finally {
      await sesion.endSession();
    }
  }

  return {
    db,
    transaccion,
    async preparar() {
      await db();
    },
    async ping() {
      await getDb().command({ ping: 1 });
    },
    async close() {
      await client?.close();
    },
  };
}
