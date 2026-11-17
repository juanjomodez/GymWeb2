export function crearEntrenadoresRepositorio(db) {
  return {
    async listarActivos() {
      return (await db()).collection('entrenadores').find({ activo: true }).sort({ nombre: 1 }).toArray();
    },
    async buscarActivo(id) {
      return (await db()).collection('entrenadores').findOne({ _id: id, activo: true });
    },
  };
}
