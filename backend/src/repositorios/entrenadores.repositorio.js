export function crearEntrenadoresRepositorio(db, session) {
  return {
    async listarActivos() {
      return (await db()).collection('entrenadores').find({ activo: true }, { session }).sort({ nombre: 1 }).toArray();
    },
    // Incluye inactivos: un comprobante antiguo debe poder mostrar a su entrenador.
    async buscarPorIds(ids) {
      return (await db()).collection('entrenadores').find({ _id: { $in: ids } }, { session }).toArray();
    },
    async buscarActivo(id) {
      return (await db()).collection('entrenadores').findOne({ _id: id, activo: true }, { session });
    },
  };
}
