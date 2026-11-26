export function crearPlanesRepositorio(db, sesionPredeterminada) {
  return {
    async listarActivos() {
      return (await db()).collection('planes').find({ activo: true }, { session: sesionPredeterminada }).sort({ orden: 1 }).toArray();
    },
    async buscarActivo(id, session = sesionPredeterminada) {
      return (await db()).collection('planes').findOne({ _id: id, activo: true }, { session });
    },
  };
}
