import { createDatabase } from '../database.js';
import { crearRepositorios } from '../repositorios/index.js';
import { crearUsuariosServicio } from './usuarios.servicio.js';
import { crearCatalogoServicio } from './catalogo.servicio.js';
import { crearMembresiasServicio } from './membresias.servicio.js';
import { crearReservasServicio } from './reservas.servicio.js';
import { crearTiendaServicio } from './tienda.servicio.js';

// Compone los servicios que consumen los controladores, conservando su contrato público.
export function crearServicios(conexion) {
  const repositorios = crearRepositorios(conexion.db);
  const { sincronizar, ...membresias } = crearMembresiasServicio(repositorios, conexion.transaccion);
  return {
    ...crearUsuariosServicio(repositorios),
    ...crearCatalogoServicio(repositorios),
    ...membresias,
    ...crearReservasServicio(repositorios, sincronizar),
    ...crearTiendaServicio(repositorios, conexion.transaccion),
    preparar: conexion.preparar, ping: conexion.ping, close: conexion.close,
  };
}

export const crearServiciosMongo = config => crearServicios(createDatabase(config));
