export function crearProductosRepositorio(db, sesionPredeterminada) {
  return {
    async listarActivos() {
      return (await db()).collection('productos').find({ activo: true }, { session: sesionPredeterminada }).sort({ precio: -1 }).toArray();
    },
    async buscarPorIds(ids, session = sesionPredeterminada) {
      return (await db()).collection('productos').find({ _id: { $in: ids } }, { session }).toArray();
    },
    async contarActivos(ids) {
      return (await db()).collection('productos').countDocuments({ _id: { $in: ids }, activo: true }, { session: sesionPredeterminada });
    },
    async descontarStock(id, cantidad, session = sesionPredeterminada) {
      // La condición y el descuento se envían juntos para evitar ventas simultáneas sin stock.
      return (await db()).collection('productos').updateOne(
        { _id: id, activo: true, stock: { $gte: cantidad } }, { $inc: { stock: -cantidad } }, { session },
      );
    },
  };
}
