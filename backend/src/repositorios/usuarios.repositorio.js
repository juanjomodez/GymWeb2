import { comoId } from './ids.js';

export function crearUsuariosRepositorio(db, session) {
  return {
    async buscarPorCorreo(correo) {
      return (await db()).collection('usuarios').findOne({ correo }, { session });
    },
    async crear(usuario) {
      const { insertedId } = await (await db()).collection('usuarios').insertOne(usuario, { session });
      return insertedId;
    },
    async buscarPorId(id, projection) {
      return (await db()).collection('usuarios').findOne({ _id: comoId(id) }, { projection, session });
    },
    async actualizar(id, cambios, { projection, returnDocument = 'after' } = {}) {
      return (await db()).collection('usuarios').findOneAndUpdate(
        { _id: comoId(id) }, cambios, { projection, returnDocument, session },
      );
    },
  };
}
