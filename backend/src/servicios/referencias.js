import { randomBytes } from 'node:crypto';

export const crearReferencia = () => `GF-${randomBytes(5).toString('hex').toUpperCase()}`;
