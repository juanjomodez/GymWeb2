export function crearCatalogoServicio({ planes, entrenadores, rutinas, productos, maquinas }) {
  return {
    listarPlanes: () => planes.listarActivos(),
    listarEntrenadores: () => entrenadores.listarActivos(),
    listarRutinas: objetivo => rutinas.listar(objetivo),
    obtenerRutina: id => rutinas.buscarPorId(id),
    listarProductos: () => productos.listarActivos(),
    listarMaquinas: () => maquinas.listar(),
  };
}
