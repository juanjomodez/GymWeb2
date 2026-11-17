import { comoId } from './ids.js';

export function crearMembresiasRepositorio(db) {
  return {
    async buscarActiva(usuario, session) {
      return (await db()).collection('membresias').findOne({ usuarioId: comoId(usuario), estado: 'activa' }, { session });
    },
    async buscarVencida(usuario, ahora, session) {
      return (await db()).collection('membresias').findOne(
        { usuarioId: comoId(usuario), estado: 'activa', fechaFin: { $lte: ahora } }, { session },
      );
    },
    async historial(usuario, limite) {
      return (await db()).collection('membresias').find({ usuarioId: comoId(usuario) }).sort({ fechaInicio: -1 }).limit(limite).toArray();
    },
    async actualizarVencida(id, fechaFin, cambios, session) {
      return (await db()).collection('membresias').updateOne({ _id: id, estado: 'activa', fechaFin }, cambios, { session });
    },
    async actualizar(id, cambios, session) {
      return (await db()).collection('membresias').findOneAndUpdate({ _id: id }, cambios, { session, returnDocument: 'after' });
    },
    async actualizarActiva(usuario, cambios) {
      return (await db()).collection('membresias').findOneAndUpdate(
        { usuarioId: comoId(usuario), estado: 'activa' }, cambios, { returnDocument: 'after' },
      );
    },
    async crear(membresia, session) {
      const documento = { ...membresia, usuarioId: comoId(membresia.usuarioId) };
      const { insertedId } = await (await db()).collection('membresias').insertOne(documento, { session });
      return { ...documento, _id: insertedId };
    },
  };
}
