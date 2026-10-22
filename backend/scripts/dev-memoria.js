// Servidor de desarrollo con un MongoDB temporal en memoria (no usa Atlas ni .env).
// Los datos se pierden al detenerlo. Uso: npm run dev:memoria
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const database = createDatabase({ uri: replica.getUri(), database: 'GymWeb' });
await database.preparar();
const port = Number(process.env.PORT || 3000);
const server = createApp(database).listen(port, '127.0.0.1', () => {
  console.log(`GymFlow con MongoDB en memoria: http://127.0.0.1:${port}/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await database.close();
    await replica.stop();
    process.exit(0);
  }));
}
