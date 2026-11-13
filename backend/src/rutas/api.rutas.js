// Mapa de la API REST: verbo + ruta → (autenticacion) → validación → controlador.
// Cada controlador va envuelto en asincrono() para que sus errores lleguen al manejador central.
import { Router } from 'express';
import { asincrono as a } from '../middlewares/errores.js';
import { validar } from '../middlewares/validar.js';
import { subidaFoto } from '../middlewares/subidaFoto.js';
import * as esquemas from '../validaciones/esquemas.js';
import { crearAuthControlador } from '../controladores/auth.controlador.js';
import { crearCatalogoControlador } from '../controladores/catalogo.controlador.js';
import { crearPerfilControlador } from '../controladores/perfil.controlador.js';
import { crearMembresiasControlador } from '../controladores/membresias.controlador.js';
import { crearReservasControlador } from '../controladores/reservas.controlador.js';
import { crearTiendaControlador } from '../controladores/tienda.controlador.js';

export function crearRutasApi(servicios, autenticacion) {
  const { requireUser } = autenticacion;
  const auth = crearAuthControlador(servicios, autenticacion);
  const catalogo = crearCatalogoControlador(servicios);
  const perfil = crearPerfilControlador(servicios);
  const membresias = crearMembresiasControlador(servicios);
  const reservas = crearReservasControlador(servicios);
  const tienda = crearTiendaControlador(servicios);
  const router = Router();

  // ---------- cuenta y sesión ----------
  router.post('/usuarios', validar({ body: esquemas.registro }), a(auth.registrar));
  router.post('/login', validar({ body: esquemas.login }), a(auth.iniciarSesion, 'No se pudo iniciar sesión. Intenta más tarde.'));
  router.post('/logout', a(auth.cerrarSesion, 'No se pudo cerrar sesión. Intenta nuevamente.'));
  router.get('/sesion', a(auth.estadoSesion));
  router.get('/me', requireUser, auth.yo);

  // ---------- catálogo público ----------
  router.get('/planes', a(catalogo.planes));
  router.get('/entrenadores', a(catalogo.entrenadores));
  router.get('/entrenadores/:id/disponibilidad', validar({ params: esquemas.idEntrenador, query: esquemas.fechaDisponibilidad }), a(catalogo.disponibilidad));
  router.get('/productos', a(catalogo.productos));
  router.get('/maquinas', a(catalogo.maquinas));
  router.get('/rutinas', validar({ query: esquemas.filtroRutinas }), a(catalogo.rutinas));
  router.get('/rutinas/:id', requireUser, validar({ params: esquemas.idRutina }), a(catalogo.rutina));

  // ---------- perfil y foto ----------
  router.get('/perfil', requireUser, a(perfil.ver));
  router.patch('/perfil', requireUser, validar({ body: esquemas.actualizarPerfil }), a(perfil.actualizar));
  router.post('/perfil/foto', requireUser, subidaFoto, a(perfil.subirFoto));
  router.delete('/perfil/foto', requireUser, a(perfil.eliminarFoto));
  router.get('/fotos/:id', validar({ params: esquemas.idFoto }), a(perfil.descargarFoto));

  // ---------- membresía ----------
  router.get('/membresia', requireUser, a(membresias.ver));
  router.post('/membresias', requireUser, validar({ body: esquemas.compraMembresia }), a(membresias.comprar));
  router.patch('/membresia', requireUser, validar({ body: esquemas.renovacion }), a(membresias.cambiarRenovacion));

  // ---------- reservas ----------
  router.get('/reservas', requireUser, a(reservas.listar));
  router.post('/reservas', requireUser, validar({ body: esquemas.nuevaReserva }), a(reservas.crear));
  router.delete('/reservas/:id', requireUser, validar({ params: esquemas.idReserva }), a(reservas.cancelar));

  // ---------- carrito y pedidos ----------
  router.get('/carrito', requireUser, a(tienda.verCarrito));
  router.put('/carrito', requireUser, validar({ body: esquemas.carrito }), a(tienda.guardarCarrito));
  router.get('/pedidos', requireUser, a(tienda.listarPedidos));
  router.post('/pedidos', requireUser, a(tienda.crearPedido));

  return router;
}