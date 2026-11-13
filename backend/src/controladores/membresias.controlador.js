// Membresias: consulta con historial, compra simulada y renovación automatica.
export function crearMembresiasControlador(servicios) {
  return {
    async ver(request, response) {
      response.json(await servicios.obtenerMembresia(request.user.id));
    },
    async comprar(request, response) {
      const { planId, meses } = request.valido.body;
      const membresia = await servicios.comprarMembresia(request.user.id, planId, meses);
      response.status(201).json({ message: 'Compra simulada realizada. Tu membresía está activa.', membresia });
    },
    async cambiarRenovacion(request, response) {
      const { renovacionAutomatica } = request.valido.body;
      const membresia = await servicios.cambiarRenovacion(request.user.id, renovacionAutomatica);
      response.json({ message: renovacionAutomatica ? 'Renovación automática activada.' : 'Renovación automática desactivada.', membresia });
    },
  };
}