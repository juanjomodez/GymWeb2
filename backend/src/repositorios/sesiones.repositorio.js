import { comoId } from './ids.js';

export function crearSesionesRepositorio(db) {
  return {
    async crear(sesion) {
      await (await db()).collection('sesiones').insertOne({ ...sesion, userId: comoId(sesion.userId) ?? sesion.userId });
    },
    async buscarVigente(tokenHash, ahora) {
      return (await db()).collection('sesiones').findOne({ _id: tokenHash, expiresAt: { $gt: ahora } });
    },
    async eliminar(tokenHash) {
      await (await db()).collection('sesiones').deleteOne({ _id: tokenHash });
    },
  };
}
