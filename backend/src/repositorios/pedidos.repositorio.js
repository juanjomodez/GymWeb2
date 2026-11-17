import { comoId } from './ids.js';

export function crearPedidosRepositorio(db) {
  return {
    async crear(pedido, session) {
      const documento = { ...pedido, usuarioId: comoId(pedido.usuarioId) };
      const { insertedId } = await (await db()).collection('pedidos').insertOne(documento, { session });
      return { ...documento, _id: insertedId };
    },
    async listar(usuario, limite) {
      return (await db()).collection('pedidos').find({ usuarioId: comoId(usuario) }, { projection: { usuarioId: 0 } }).sort({ createdAt: -1 }).limit(limite).toArray();
    },
  };
}
