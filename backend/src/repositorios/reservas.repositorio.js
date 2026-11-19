import { comoId } from './ids.js';

export function crearReservasRepositorio(db, session) {
  return {
    async buscarOcupadas(entrenadorId, inicios) {
      return (await db()).collection('reservas').find(
        { entrenadorId, estado: 'confirmada', inicio: { $in: inicios } }, { projection: { inicio: 1 }, session },
      ).toArray();
    },
    async contarFuturas(usuario, ahora) {
      return (await db()).collection('reservas').countDocuments({ usuarioId: comoId(usuario), estado: 'confirmada', inicio: { $gt: ahora } }, { session });
    },
    async crear(reserva) {
      const { insertedId } = await (await db()).collection('reservas').insertOne({ ...reserva, usuarioId: comoId(reserva.usuarioId) }, { session });
      return insertedId;
    },
    async listar(usuario, limite) {
      return (await db()).collection('reservas').aggregate([
        { $match: { usuarioId: comoId(usuario) } },
        { $sort: { inicio: -1 } },
        { $limit: limite },
        { $lookup: { from: 'entrenadores', localField: 'entrenadorId', foreignField: '_id', as: 'e' } },
        { $project: { _id: 0, id: { $toString: '$_id' }, entrenadorId: 1, inicio: 1, fin: 1, estado: 1, entrenador: { $first: '$e.nombre' }, imagen: { $first: '$e.imagen' } } },
      ], { session }).toArray();
    },
    async cancelarFutura(usuario, id, ahora) {
      return (await db()).collection('reservas').updateOne(
        { _id: comoId(id), usuarioId: comoId(usuario), estado: 'confirmada', inicio: { $gt: ahora } },
        { $set: { estado: 'cancelada', canceladaAt: ahora } }, { session },
      );
    },
  };
}
