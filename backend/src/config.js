import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { setServers } from 'node:dns';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);

// Opcional: resolver SRV de Atlas cuando el DNS de la red bloquea consultas.
// Solo afecta las consultas DNS de este proceso, no la configuracion de Windows.
const dnsServers = process.env.MONGODB_DNS_SERVERS?.trim();
if (dnsServers) {
  try {
    setServers(dnsServers.split(',').map(server => server.trim()));
  } catch {
    throw new Error('MONGODB_DNS_SERVERS debe contener IP de DNS separadas por comas.');
  }
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

// Origenes externos que pueden llamar a la API con CORS (separados por comas). Vacio = solo el mismo origen.
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(origen => origen.trim().replace(/\/+$/, '')).filter(Boolean);
for (const origen of corsOrigins) {
  if (!/^https?:\/\/[^/\s]+$/.test(origen)) throw new Error(`CORS_ORIGINS contiene un origen inválido: ${origen}`);
}

export const config = {
  uri: process.env.MONGODB_URI?.trim() || '',
  database: process.env.MONGODB_DB?.trim() || 'GymWeb',
  host: process.env.HOST || '127.0.0.1',
  port,
  // Detrás del proxy HTTPS del hosting (Render): numero de saltos de proxy en los que confiar.
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  corsOrigins,
  // Carpeta de los comprobantes PDF (persistencia dual). Vacío = backend/almacenamiento/.
  almacenamiento: process.env.ALMACENAMIENTO_DIR?.trim() || undefined,
};