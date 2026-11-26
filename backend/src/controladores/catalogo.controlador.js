// Catalogo público: planes, entrenadores (y su disponibilidad), productos, maquinas y rutinas.
import { ErrorHttp } from '../middlewares/errores.js';

// Convierte _id de MongoDB en id y quita campos internos.
const conId = ({ _id, activo: _activo, ...resto }) => ({ id: _id, ...resto });
// El catalogo cambia poco: el navegador puede reutilizarlo un minuto.
const cachePublica = response => response.set('Cache-Control', 'public, max-age=60');

export function crearCatalogoControlador(servicios) {
  return {
    async planes(_request, response) {
      cachePublica(response).json({ planes: (await servicios.listarPlanes()).map(conId) });
    },
    async entrenadores(_request, response) {
      cachePublica(response).json({ entrenadores: (await servicios.listarEntrenadores()).map(conId) });
    },
    async disponibilidad(request, response) {
      const { id } = request.valido.params;
      const { fecha } = request.valido.query;
      response.json({ fecha, horarios: await servicios.disponibilidad(id, fecha) });
    },
    // Sin cache: el stock cambia con cada compra.
    async productos(_request, response) {
      response.json({ productos: (await servicios.listarProductos()).map(conId) });
    },
    async maquinas(_request, response) {
      cachePublica(response).json({ maquinas: (await servicios.listarMaquinas()).map(conId) });
    },
    async rutinas(request, response) {
      cachePublica(response).json({ rutinas: (await servicios.listarRutinas(request.valido.query.objetivo)).map(conId) });
    },
    // El detalle de cada rutina es parte de la cuenta (HU-06: usuario registrado).
    async rutina(request, response) {
      const rutina = await servicios.obtenerRutina(request.valido.params.id);
      if (!rutina) throw new ErrorHttp(404, 'Rutina no encontrada.');
      response.json({ rutina: conId(rutina) });
    },
  };
}