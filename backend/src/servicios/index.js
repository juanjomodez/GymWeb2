import { ALMACENAMIENTO_POR_DEFECTO, createDatabase } from '../database.js';
import { crearRepositorios } from '../repositorios/index.js';
import { crearDisco } from '../almacenamiento/disco.js';
import { crearUsuariosServicio } from './usuarios.servicio.js';
import { crearCatalogoServicio } from './catalogo.servicio.js';
import { crearMembresiasServicio } from './membresias.servicio.js';
import { crearReservasServicio } from './reservas.servicio.js';
import { crearTiendaServicio } from './tienda.servicio.js';
import { crearArchivosServicio } from './archivos.servicio.js';

// Compone los servicios que consumen los controladores, conservando su contrato público.
// Una sesión opcional agrupa varias operaciones de negocio en la transacción del seed.
export function crearServicios(conexion, { session } = {}) {
  const repositorios = crearRepositorios(conexion.db, session);
  // Dentro de la transacción del seed no se escriben ficheros: un PDF no se desharía si la transacción falla.
  // Esos comprobantes se generan la primera vez que el usuario abre su cuenta.
  const { listarArchivos, abrirArchivo, ...archivos } = crearArchivosServicio(repositorios, {
    disco: crearDisco(conexion.almacenamiento ?? ALMACENAMIENTO_POR_DEFECTO), emitir: !session,
  });
  const { sincronizar, ...membresias } = crearMembresiasServicio(repositorios, conexion.transaccion, archivos);
  return {
    ...crearUsuariosServicio(repositorios, archivos),
    ...crearCatalogoServicio(repositorios),
    ...membresias,
    ...crearReservasServicio(repositorios, sincronizar, archivos),
    ...crearTiendaServicio(repositorios, conexion.transaccion, archivos),
    listarArchivos, abrirArchivo,
    preparar: conexion.preparar, ping: conexion.ping, close: conexion.close,
  };
}

export const crearServiciosMongo = config => crearServicios(createDatabase(config));
