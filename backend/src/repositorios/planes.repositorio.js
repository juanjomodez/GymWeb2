export function crearPlanesRepositorio(db) {
  return {
    async listarActivos() {
      return (await db()).collection('planes').find({ activo: true }).sort({ orden: 1 }).toArray();
    },
    async buscarActivo(id, session) {
      return (await db()).collection('planes').findOne({ _id: id, activo: true }, { session });
    },
  };
}
