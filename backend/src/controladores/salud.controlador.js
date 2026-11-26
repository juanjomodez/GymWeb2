// Comprobaciones para el hosting y para la rubrica (/health probado contra la base de datos).
export function crearSaludControlador(servicios) {
  return {
    // Solo dice que el proceso HTTP responde; no toca la base de datos.
    vivo(_request, response) {
      response.set('Cache-Control', 'no-store').json({ status: 'ok' });
    },
    // Hace ping a MongoDB en cada petición.
    async salud(_request, response) {
      response.set('Cache-Control', 'no-store');
      try {
        await servicios.ping();
        response.status(200).json({ status: 'ok', database: 'connected' });
      } catch {
        // No exponer mensajes del driver: pueden contener datos de conexión.
        response.status(503).json({ status: 'error', database: 'unavailable' });
      }
    },
  };
}