import { comoId } from './ids.js';

export function crearCarritosRepositorio(db) {
  return {
    async buscar(usuario, session) {
      return (await db()).collection('carritos').findOne({ _id: comoId(usuario) }, { session });
    },
    async guardar(usuario, items, updatedAt, session) {
      return (await db()).collection('carritos').updateOne(
        { _id: comoId(usuario) }, { $set: { items, updatedAt } }, { upsert: true, session },
      );
    },
  };
}
