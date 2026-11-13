// Citas con entrenadores.
export function crearReservasControlador(servicios) {
  return {
    async listar(request, response) {
      response.json({ reservas: await servicios.listarReservas(request.user.id) });
    },
    async crear(request, response) {
      const { entrenadorId, inicio } = request.valido.body;
      const reserva = await servicios.crearReserva(request.user.id, entrenadorId, inicio);
      response.status(201).json({ message: 'Cita reservada.', reserva });
    },
    async cancelar(request, response) {
      await servicios.cancelarReserva(request.user.id, request.valido.params.id);
      response.json({ message: 'Cita cancelada.' });
    },
  };
}