// Rutas de la API para membresías, entrenadores, reservas, rutinas, tienda y máquinas.
// Toda entrada se valida aquí; las reglas de negocio viven en database.js.
import { ErrorNegocio, MESES_VALIDOS } from './database.js';
import { OBJETIVOS } from './esquema.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const esSlug = valor => typeof valor === 'string' && valor.length <= 60 && SLUG.test(valor);
const esFecha = valor => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));

// Envuelve un manejador: errores de negocio → su estado; cualquier otro fallo → 503 sin detalles.
const manejar = fn => async (request, response) => {
  try {
    await fn(request, response);
  } catch (error) {
    if (error instanceof ErrorNegocio) return response.status(error.status).json({ message: error.message });
    console.error(`[api] ${request.method} ${request.path}:`, error.message);
    response.status(503).json({ message: 'No se pudo completar la operación. Intenta más tarde.' });
  }
};
const invalido = (response, message) => response.status(400).json({ message });
// El catálogo cambia poco: el navegador puede reutilizarlo un minuto.
const publico = response => response.set('Cache-Control', 'public, max-age=60');

export function setupApi(app, database, requireUser) {
  // ---------- catálogo público ----------
  app.get('/api/planes', manejar(async (_req, res) => {
    const planes = await database.listarPlanes();
    publico(res).json({ planes: planes.map(({ _id, activo: _a, ...p }) => ({ id: _id, ...p })) });
  }));
  app.get('/api/entrenadores', manejar(async (_req, res) => {
    const entrenadores = await database.listarEntrenadores();
    publico(res).json({ entrenadores: entrenadores.map(({ _id, activo: _a, ...e }) => ({ id: _id, ...e })) });
  }));
  app.get('/api/productos', manejar(async (_req, res) => {
    const productos = await database.listarProductos();
    res.json({ productos: productos.map(({ _id, activo: _a, ...p }) => ({ id: _id, ...p })) });
  }));
  app.get('/api/maquinas', manejar(async (_req, res) => {
    const maquinas = await database.listarMaquinas();
    publico(res).json({ maquinas: maquinas.map(({ _id, ...m }) => ({ id: _id, ...m })) });
  }));
  app.get('/api/rutinas', manejar(async (req, res) => {
    const { objetivo } = req.query;
    if (objetivo !== undefined && !OBJETIVOS.includes(objetivo)) return invalido(res, `Objetivo inválido. Usa: ${OBJETIVOS.join(', ')}.`);
    const rutinas = await database.listarRutinas(objetivo);
    publico(res).json({ rutinas: rutinas.map(({ _id, ...r }) => ({ id: _id, ...r })) });
  }));
  // El detalle de cada rutina es parte de la cuenta (HU-06: usuario registrado).
  app.get('/api/rutinas/:id', requireUser, manejar(async (req, res) => {
    if (!esSlug(req.params.id)) return res.status(404).json({ message: 'Rutina no encontrada.' });
    const rutina = await database.obtenerRutina(req.params.id);
    if (!rutina) return res.status(404).json({ message: 'Rutina no encontrada.' });
    const { _id, ...resto } = rutina;
    res.json({ rutina: { id: _id, ...resto } });
  }));
  app.get('/api/entrenadores/:id/disponibilidad', manejar(async (req, res) => {
    const { fecha } = req.query;
    if (!esSlug(req.params.id)) return res.status(404).json({ message: 'Entrenador no encontrado.' });
    if (!esFecha(fecha)) return invalido(res, 'Indica la fecha como AAAA-MM-DD.');
    res.json({ fecha, horarios: await database.disponibilidad(req.params.id, fecha) });
  }));

  // ---------- membresía ----------
  app.get('/api/membresia', requireUser, manejar(async (req, res) => {
    res.json(await database.obtenerMembresia(req.user.id));
  }));
  app.post('/api/membresias', requireUser, manejar(async (req, res) => {
    const { planId, meses } = req.body ?? {};
    if (!esSlug(planId) || !MESES_VALIDOS.includes(meses)) return invalido(res, `Elige un plan y una duración de ${MESES_VALIDOS.join(', ')} meses.`);
    const membresia = await database.comprarMembresia(req.user.id, planId, meses);
    res.status(201).json({ message: 'Compra simulada realizada. Tu membresía está activa.', membresia });
  }));
  app.patch('/api/membresia', requireUser, manejar(async (req, res) => {
    const { renovacionAutomatica } = req.body ?? {};
    if (typeof renovacionAutomatica !== 'boolean') return invalido(res, 'renovacionAutomatica debe ser true o false.');
    const membresia = await database.cambiarRenovacion(req.user.id, renovacionAutomatica);
    res.json({ message: renovacionAutomatica ? 'Renovación automática activada.' : 'Renovación automática desactivada.', membresia });
  }));

  // ---------- reservas ----------
  app.get('/api/reservas', requireUser, manejar(async (req, res) => {
    res.json({ reservas: await database.listarReservas(req.user.id) });
  }));
  app.post('/api/reservas', requireUser, manejar(async (req, res) => {
    const { entrenadorId, inicio } = req.body ?? {};
    const fecha = typeof inicio === 'string' && inicio.length <= 40 ? new Date(inicio) : null;
    if (!esSlug(entrenadorId) || !fecha || Number.isNaN(fecha.getTime())) return invalido(res, 'Elige un entrenador y un horario.');
    const reserva = await database.crearReserva(req.user.id, entrenadorId, fecha);
    res.status(201).json({ message: 'Cita reservada.', reserva });
  }));
  app.delete('/api/reservas/:id', requireUser, manejar(async (req, res) => {
    await database.cancelarReserva(req.user.id, req.params.id);
    res.json({ message: 'Cita cancelada.' });
  }));

  // ---------- carrito y pedidos ----------
  app.get('/api/carrito', requireUser, manejar(async (req, res) => {
    res.json(await database.obtenerCarrito(req.user.id));
  }));
  app.put('/api/carrito', requireUser, manejar(async (req, res) => {
    const { items } = req.body ?? {};
    const valido = Array.isArray(items) && items.length <= 30 && items.every(i => i && esSlug(i.productoId) && Number.isInteger(i.cantidad) && i.cantidad >= 1 && i.cantidad <= 20);
    if (!valido) return invalido(res, 'Cada producto necesita un identificador y una cantidad de 1 a 20.');
    res.json(await database.guardarCarrito(req.user.id, items));
  }));
  app.get('/api/pedidos', requireUser, manejar(async (req, res) => {
    res.json({ pedidos: await database.listarPedidos(req.user.id) });
  }));
  app.post('/api/pedidos', requireUser, manejar(async (req, res) => {
    const pedido = await database.crearPedido(req.user.id);
    res.status(201).json({ message: `Compra simulada realizada. Referencia ${pedido.referencia}.`, pedido });
  }));
}
