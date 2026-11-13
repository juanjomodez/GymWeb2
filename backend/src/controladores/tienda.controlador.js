// Carrito y pedidos (compra simulada).
export function crearTiendaControlador(servicios) {
  return {
    async verCarrito(request, response) {
      response.json(await servicios.obtenerCarrito(request.user.id));
    },
    async guardarCarrito(request, response) {
      response.json(await servicios.guardarCarrito(request.user.id, request.valido.body.items));
    },
    async listarPedidos(request, response) {
      response.json({ pedidos: await servicios.listarPedidos(request.user.id) });
    },
    async crearPedido(request, response) {
      const pedido = await servicios.crearPedido(request.user.id);
      response.status(201).json({ message: `Compra simulada realizada. Referencia ${pedido.referencia}.`, pedido });
    },
  };
}