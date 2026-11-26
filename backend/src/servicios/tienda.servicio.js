import { ErrorNegocio } from './errores.js';
import { crearReferencia } from './referencias.js';

export function crearTiendaServicio({ carritos, productos, pedidos }, transaccion, archivos) {
  async function obtenerCarrito(usuario, session) {
    const carrito = await carritos.buscar(usuario, session);
    const items = carrito?.items ?? [];
    const porId = new Map((await productos.buscarPorIds(items.map(item => item.productoId), session)).map(producto => [producto._id, producto]));
    const detalle = items.filter(item => porId.get(item.productoId)?.activo).map(item => {
      const producto = porId.get(item.productoId);
      return { productoId: producto._id, nombre: producto.nombre, imagen: producto.imagen, precio: producto.precio, stock: producto.stock, cantidad: item.cantidad, subtotal: producto.precio * item.cantidad };
    });
    return { items: detalle, total: detalle.reduce((suma, item) => suma + item.subtotal, 0) };
  }

  return {
    obtenerCarrito: usuario => obtenerCarrito(usuario),
    async guardarCarrito(usuario, items) {
      const cantidades = new Map();
      for (const { productoId, cantidad } of items) cantidades.set(productoId, Math.min(20, (cantidades.get(productoId) ?? 0) + cantidad));
      if (await productos.contarActivos([...cantidades.keys()]) !== cantidades.size) {
        throw new ErrorNegocio(400, 'El carrito contiene productos que no existen.');
      }
      await carritos.guardar(usuario, [...cantidades].map(([productoId, cantidad]) => ({ productoId, cantidad })), new Date());
      return obtenerCarrito(usuario);
    },
    async crearPedido(usuario) {
      const pedido = await transaccion(async (_base, session) => {
        const { items, total } = await obtenerCarrito(usuario, session);
        if (!items.length) throw new ErrorNegocio(400, 'Tu carrito está vacío.');
        for (const item of items) {
          const resultado = await productos.descontarStock(item.productoId, item.cantidad, session);
          if (!resultado.matchedCount) throw new ErrorNegocio(409, `No hay unidades suficientes de ${item.nombre}.`);
        }
        const pedido = await pedidos.crear({
          usuarioId: usuario,
          items: items.map(({ productoId, nombre, precio, cantidad, subtotal }) => ({ productoId, nombre, precioUnitario: precio, cantidad, subtotal })),
          total, estado: 'pagado', referencia: crearReferencia(), createdAt: new Date(),
        }, session);
        await carritos.guardar(usuario, [], new Date(), session);
        return pedido;
      });
      // El comprobante se genera después de confirmar la transacción.
      await archivos.comprobantesPedidos(usuario, [pedido]);
      const comprobante = (await archivos.urlsPorOperacion('pedidos', [pedido.referencia])).get(pedido.referencia) ?? null;
      const { _id, usuarioId, ...publico } = pedido;
      return { id: _id.toString(), ...publico, comprobante };
    },
    async listarPedidos(usuario) {
      const lista = await pedidos.listar(usuario, 30);
      const urls = await archivos.urlsPorOperacion('pedidos', lista.map(p => p.referencia));
      return lista.map(({ _id, ...pedido }) => ({ id: _id.toString(), ...pedido, comprobante: urls.get(pedido.referencia) ?? null }));
    },
  };
}
