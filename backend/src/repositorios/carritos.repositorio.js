import { comoId } from './ids.js';

export function crearCarritosRepositorio(db, sesionPredeterminada) {
  return {
    async buscar(usuario, session = sesionPredeterminada) {
      return (await db()).collection('carritos').findOne({ _id: comoId(usuario) }, { session });
    },
    async guardar(usuario, items, updatedAt, session = sesionPredeterminada) {
      return (await db()).collection('carritos').updateOne(
        { _id: comoId(usuario) }, { $set: { items, updatedAt } }, { upsert: true, session },
      );
    },
  };
}
