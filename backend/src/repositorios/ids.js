import { ObjectId } from 'mongodb';

// Conversión de IDs al tipo que usa MongoDB, compartida por los repositorios.
export const comoId = id => id instanceof ObjectId ? id : ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null;
