import { comoId } from './ids.js';

export function crearMembresiasRepositorio(db, sesionPredeterminada) {
  return {
    async buscarActiva(usuario, session = sesionPredeterminada) {
      return (await db()).collection('membresias').findOne({ usuarioId: comoId(usuario), estado: 'activa' }, { session });
    },
    async buscarVencida(usuario, ahora, session = sesionPredeterminada) {
      return (await db()).collection('membresias').findOne(
        { usuarioId: comoId(usuario), estado: 'activa', fechaFin: { $lte: ahora } }, { session },
      );
    },
    async historial(usuario, limite) {
      return (await db()).collection('membresias').find({ usuarioId: comoId(usuario) }, { session: sesionPredeterminada }).sort({ fechaInicio: -1 }).limit(limite).toArray();
    },
    async actualizarVencida(id, fechaFin, cambios, session = sesionPredeterminada) {
      return (await db()).collection('membresias').updateOne({ _id: id, estado: 'activa', fechaFin }, cambios, { session });
    },
    async actualizar(id, cambios, session = sesionPredeterminada) {
      return (await db()).collection('membresias').findOneAndUpdate({ _id: id }, cambios, { session, returnDocument: 'after' });
    },
    async actualizarActiva(usuario, cambios) {
      return (await db()).collection('membresias').findOneAndUpdate(
        { usuarioId: comoId(usuario), estado: 'activa' }, cambios, { returnDocument: 'after', session: sesionPredeterminada },
      );
    },
    async crear(membresia, session = sesionPredeterminada) {
      const documento = { ...membresia, usuarioId: comoId(membresia.usuarioId) };
      const { insertedId } = await (await db()).collection('membresias').insertOne(documento, { session });
      return { ...documento, _id: insertedId };
    },
  };
}
