import { crearUsuariosRepositorio } from './usuarios.repositorio.js';
import { crearSesionesRepositorio } from './sesiones.repositorio.js';
import { crearPlanesRepositorio } from './planes.repositorio.js';
import { crearMembresiasRepositorio } from './membresias.repositorio.js';
import { crearEntrenadoresRepositorio } from './entrenadores.repositorio.js';
import { crearReservasRepositorio } from './reservas.repositorio.js';
import { crearRutinasRepositorio } from './rutinas.repositorio.js';
import { crearProductosRepositorio } from './productos.repositorio.js';
import { crearCarritosRepositorio } from './carritos.repositorio.js';
import { crearPedidosRepositorio } from './pedidos.repositorio.js';
import { crearMaquinasRepositorio } from './maquinas.repositorio.js';
import { crearFotosRepositorio } from './fotos.repositorio.js';
import { crearArchivosRepositorio } from './archivos.repositorio.js';

export function crearRepositorios(db, session) {
  return {
    usuarios: crearUsuariosRepositorio(db, session), sesiones: crearSesionesRepositorio(db, session),
    planes: crearPlanesRepositorio(db, session), membresias: crearMembresiasRepositorio(db, session),
    entrenadores: crearEntrenadoresRepositorio(db, session), reservas: crearReservasRepositorio(db, session),
    rutinas: crearRutinasRepositorio(db, session), productos: crearProductosRepositorio(db, session),
    carritos: crearCarritosRepositorio(db, session), pedidos: crearPedidosRepositorio(db, session),
    maquinas: crearMaquinasRepositorio(db, session), fotos: crearFotosRepositorio(db),
    archivos: crearArchivosRepositorio(db, session),
  };
}
