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

export function crearRepositorios(db) {
  return {
    usuarios: crearUsuariosRepositorio(db), sesiones: crearSesionesRepositorio(db),
    planes: crearPlanesRepositorio(db), membresias: crearMembresiasRepositorio(db),
    entrenadores: crearEntrenadoresRepositorio(db), reservas: crearReservasRepositorio(db),
    rutinas: crearRutinasRepositorio(db), productos: crearProductosRepositorio(db),
    carritos: crearCarritosRepositorio(db), pedidos: crearPedidosRepositorio(db),
    maquinas: crearMaquinasRepositorio(db), fotos: crearFotosRepositorio(db),
  };
}
