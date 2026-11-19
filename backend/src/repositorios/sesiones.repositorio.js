import { comoId } from './ids.js';

export function crearSesionesRepositorio(db, session) {
  return {
    async crear(sesion) {
      await (await db()).collection('sesiones').insertOne({ ...sesion, userId: comoId(sesion.userId) ?? sesion.userId }, { session });
    },
    async buscarVigente(tokenHash, ahora) {
      return (await db()).collection('sesiones').findOne({ _id: tokenHash, expiresAt: { $gt: ahora } }, { session });
    },
    async eliminar(tokenHash) {
      await (await db()).collection('sesiones').deleteOne({ _id: tokenHash }, { session });
    },
  };
}
