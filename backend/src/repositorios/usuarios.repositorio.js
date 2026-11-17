import { comoId } from './ids.js';

export function crearUsuariosRepositorio(db) {
  return {
    async buscarPorCorreo(correo) {
      return (await db()).collection('usuarios').findOne({ correo });
    },
    async crear(usuario) {
      const { insertedId } = await (await db()).collection('usuarios').insertOne(usuario);
      return insertedId;
    },
    async buscarPorId(id, projection) {
      return (await db()).collection('usuarios').findOne({ _id: comoId(id) }, { projection });
    },
    async actualizar(id, cambios, { projection, returnDocument = 'after' } = {}) {
      return (await db()).collection('usuarios').findOneAndUpdate(
        { _id: comoId(id) }, cambios, { projection, returnDocument },
      );
    },
  };
}
