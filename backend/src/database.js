import { randomBytes } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { asegurarEsquema } from './esquema.js';
import { sembrarCatalogo } from './catalogo.js';

// Errores de reglas de negocio: la API los convierte en respuestas con su estado HTTP.
export class ErrorNegocio extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// El gimnasio está en Cali (UTC−5, sin horario de verano): las horas de los entrenadores son locales.
const DESFASE_CALI = 5 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;
const DIAS_RESERVA = 30;
const MAX_RESERVAS_FUTURAS = 4;
export const MESES_VALIDOS = [1, 3, 6, 12];

const referencia = () => `GF-${randomBytes(5).toString('hex').toUpperCase()}`;
const comoId = id => (id instanceof ObjectId ? id : ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);

export function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

// Fecha "YYYY-MM-DD" + "HH:00" en hora de Cali → Date (UTC).
const instante = (fecha, hora) => new Date(`${fecha}T${hora}:00-05:00`);
const diaIso = fecha => new Date(`${fecha}T12:00:00-05:00`).getUTCDay() || 7;
const local = d => new Date(d.getTime() - DESFASE_CALI);
const fechaLocal = d => local(d).toISOString().slice(0, 10);
const horaLocal = d => local(d).toISOString().slice(11, 16);

function publicaMembresia(m) {
  if (!m) return null;
  const { _id, usuarioId, pagos, ...resto } = m;
  return { id: _id.toString(), ...resto, pagos: pagos.map(({ referencia: r, monto, fecha, tipo }) => ({ referencia: r, monto, fecha, tipo })) };
}

export function createDatabase({ uri, database }) {
  let client;
  let preparado;
  function getDb() {
    if (!uri) throw new Error('MONGODB_URI no configurada');
    client ??= new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
      socketTimeoutMS: 10000, timeoutMS: 10000,
    });
    return client.db(database);
  }
  // Esquema, índices y catálogo una sola vez por proceso; si falla, se reintenta en la siguiente operación.
  async function db() {
    const base = getDb();
    preparado ??= asegurarEsquema(base).then(() => sembrarCatalogo(base)).catch(error => {
      preparado = undefined;
      throw error;
    });
    await preparado;
    return base;
  }
  async function transaccion(fn) {
    const base = await db();
    const sesion = client.startSession();
    try {
      let resultado;
      await sesion.withTransaction(async () => { resultado = await fn(base, sesion); });
      return resultado;
    } finally {
      await sesion.endSession();
    }
  }

  // Aplica vencimientos y renovaciones automáticas pendientes de un usuario (simuladas, sin cobro real).
  async function sincronizarMembresia(base, usuarioId, session) {
    const ahora = new Date();
    const membresias = base.collection('membresias');
    const m = await membresias.findOne({ usuarioId, estado: 'activa', fechaFin: { $lte: ahora } }, { session });
    if (!m) return;
    const filtro = { _id: m._id, estado: 'activa', fechaFin: m.fechaFin };
    if (!m.renovacionAutomatica) {
      await membresias.updateOne(filtro, { $set: { estado: 'vencida', updatedAt: ahora } }, { session });
      return;
    }
    let fin = m.fechaFin;
    const pagos = [];
    while (fin <= ahora && pagos.length < 24) {
      fin = sumarMeses(fin, m.meses);
      pagos.push({ referencia: referencia(), monto: m.plan.precioMensual * m.meses, fecha: ahora, tipo: 'renovacion' });
    }
    await membresias.updateOne(filtro, {
      $set: { fechaFin: fin, updatedAt: ahora },
      $push: { pagos: { $each: pagos } },
      $inc: { precioPagado: pagos.reduce((s, p) => s + p.monto, 0) },
    }, { session });
  }

  async function carritoDetallado(base, usuarioId, session) {
    const carrito = await base.collection('carritos').findOne({ _id: usuarioId }, { session });
    const items = carrito?.items ?? [];
    const productos = await base.collection('productos').find({ _id: { $in: items.map(i => i.productoId) } }, { session }).toArray();
    const porId = new Map(productos.map(p => [p._id, p]));
    const detalle = items.filter(i => porId.get(i.productoId)?.activo).map(i => {
      const p = porId.get(i.productoId);
      return { productoId: p._id, nombre: p.nombre, imagen: p.imagen, precio: p.precio, stock: p.stock, cantidad: i.cantidad, subtotal: p.precio * i.cantidad };
    });
    return { items: detalle, total: detalle.reduce((s, i) => s + i.subtotal, 0) };
  }

  return {
    // ---------- usuarios y sesiones ----------
    async findUserByEmail(correo) {
      return (await db()).collection('usuarios').findOne({ correo });
    },
    async createUser(user) {
      const result = await (await db()).collection('usuarios').insertOne({ rol: 'cliente', ...user });
      return { id: result.insertedId.toString(), nombre: user.nombre, correo: user.correo };
    },
    async createSession(session) {
      await (await db()).collection('sesiones').insertOne({ ...session, userId: comoId(session.userId) ?? session.userId });
    },
    async findSessionUser(tokenHash) {
      const base = await db();
      const session = await base.collection('sesiones').findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } });
      const userId = session && comoId(session.userId);
      if (!userId) return null;
      const user = await base.collection('usuarios').findOne({ _id: userId }, { projection: { nombre: 1, correo: 1, rol: 1 } });
      return user ? { id: user._id.toString(), nombre: user.nombre, correo: user.correo, rol: user.rol ?? 'cliente' } : null;
    },
    async deleteSession(tokenHash) {
      await (await db()).collection('sesiones').deleteOne({ _id: tokenHash });
    },

    // ---------- planes y membresías ----------
    async listarPlanes() {
      return (await db()).collection('planes').find({ activo: true }).sort({ orden: 1 }).toArray();
    },
    async obtenerMembresia(usuario) {
      const base = await db();
      const usuarioId = comoId(usuario);
      await sincronizarMembresia(base, usuarioId);
      const historial = await base.collection('membresias').find({ usuarioId }).sort({ fechaInicio: -1 }).limit(20).toArray();
      return { actual: publicaMembresia(historial.find(m => m.estado === 'activa')), historial: historial.map(publicaMembresia) };
    },
    async comprarMembresia(usuario, planId, meses) {
      const usuarioId = comoId(usuario);
      const membresia = await transaccion(async (base, session) => {
        const plan = await base.collection('planes').findOne({ _id: planId, activo: true }, { session });
        if (!plan) throw new ErrorNegocio(404, 'Ese plan no está disponible.');
        await sincronizarMembresia(base, usuarioId, session);
        const ahora = new Date();
        const monto = plan.precioMensual * meses;
        const pago = { referencia: referencia(), monto, fecha: ahora };
        const membresias = base.collection('membresias');
        const actual = await membresias.findOne({ usuarioId, estado: 'activa' }, { session });
        if (actual?.planId === planId) {
          // Mismo plan: se suma el tiempo comprado al final del periodo vigente.
          return membresias.findOneAndUpdate({ _id: actual._id }, {
            $set: { fechaFin: sumarMeses(actual.fechaFin, meses), updatedAt: ahora },
            $inc: { precioPagado: monto },
            $push: { pagos: { ...pago, tipo: 'extension' } },
          }, { session, returnDocument: 'after' });
        }
        if (actual) await membresias.updateOne({ _id: actual._id }, { $set: { estado: 'reemplazada', fechaFin: ahora, updatedAt: ahora } }, { session });
        const nueva = {
          usuarioId, planId,
          plan: { nombre: plan.nombre, precioMensual: plan.precioMensual, incluyeEntrenador: plan.incluyeEntrenador, maxPersonas: plan.maxPersonas },
          meses, precioPagado: monto, fechaInicio: ahora, fechaFin: sumarMeses(ahora, meses),
          estado: 'activa', renovacionAutomatica: false, pagos: [{ ...pago, tipo: 'compra' }], createdAt: ahora, updatedAt: ahora,
        };
        const { insertedId } = await membresias.insertOne(nueva, { session });
        return { ...nueva, _id: insertedId };
      });
      return publicaMembresia(membresia);
    },
    async cambiarRenovacion(usuario, activar) {
      const base = await db();
      const usuarioId = comoId(usuario);
      await sincronizarMembresia(base, usuarioId);
      const m = await base.collection('membresias').findOneAndUpdate(
        { usuarioId, estado: 'activa' },
        { $set: { renovacionAutomatica: activar, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!m) throw new ErrorNegocio(404, 'No tienes una membresía activa.');
      return publicaMembresia(m);
    },

    // ---------- entrenadores y reservas ----------
    async listarEntrenadores() {
      return (await db()).collection('entrenadores').find({ activo: true }).sort({ nombre: 1 }).toArray();
    },
    async disponibilidad(entrenadorId, fecha) {
      const base = await db();
      const entrenador = await base.collection('entrenadores').findOne({ _id: entrenadorId, activo: true });
      if (!entrenador) throw new ErrorNegocio(404, 'Entrenador no encontrado.');
      const ahora = Date.now();
      const horas = entrenador.horario.find(h => h.dia === diaIso(fecha))?.horas ?? [];
      const inicios = horas.map(h => instante(fecha, h)).filter(d => d.getTime() > ahora && d.getTime() < ahora + DIAS_RESERVA * 24 * HORA);
      const ocupadas = new Set((await base.collection('reservas')
        .find({ entrenadorId, estado: 'confirmada', inicio: { $in: inicios } }, { projection: { inicio: 1 } }).toArray())
        .map(r => r.inicio.getTime()));
      return inicios.map(d => ({ hora: horaLocal(d), inicio: d.toISOString(), disponible: !ocupadas.has(d.getTime()) }));
    },
    async crearReserva(usuario, entrenadorId, inicio) {
      const base = await db();
      const usuarioId = comoId(usuario);
      const ahora = Date.now();
      if (inicio.getTime() % HORA !== 0 || inicio.getTime() <= ahora || inicio.getTime() > ahora + DIAS_RESERVA * 24 * HORA) {
        throw new ErrorNegocio(400, `Elige un horario de los próximos ${DIAS_RESERVA} días.`);
      }
      const entrenador = await base.collection('entrenadores').findOne({ _id: entrenadorId, activo: true });
      if (!entrenador) throw new ErrorNegocio(404, 'Entrenador no encontrado.');
      if (!entrenador.horario.find(h => h.dia === diaIso(fechaLocal(inicio)))?.horas.includes(horaLocal(inicio))) {
        throw new ErrorNegocio(400, 'El entrenador no atiende en ese horario.');
      }
      await sincronizarMembresia(base, usuarioId);
      const membresia = await base.collection('membresias').findOne({ usuarioId, estado: 'activa' });
      if (!membresia?.plan.incluyeEntrenador) throw new ErrorNegocio(403, 'Las citas con entrenadores requieren un Plan Premium activo.');
      const futuras = await base.collection('reservas').countDocuments({ usuarioId, estado: 'confirmada', inicio: { $gt: new Date() } });
      if (futuras >= MAX_RESERVAS_FUTURAS) throw new ErrorNegocio(409, `Puedes tener hasta ${MAX_RESERVAS_FUTURAS} citas pendientes.`);
      const reserva = { usuarioId, entrenadorId, inicio, fin: new Date(inicio.getTime() + HORA), estado: 'confirmada', createdAt: new Date() };
      try {
        const { insertedId } = await base.collection('reservas').insertOne(reserva);
        return { id: insertedId.toString(), entrenadorId, entrenador: entrenador.nombre, inicio, fin: reserva.fin, estado: reserva.estado };
      } catch (error) {
        if (error.code !== 11000) throw error;
        throw new ErrorNegocio(409, error.keyPattern?.usuarioId ? 'Ya tienes otra cita a esa hora.' : 'Ese horario acaba de ser reservado. Elige otro.');
      }
    },
    async listarReservas(usuario) {
      return (await db()).collection('reservas').aggregate([
        { $match: { usuarioId: comoId(usuario) } },
        { $sort: { inicio: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'entrenadores', localField: 'entrenadorId', foreignField: '_id', as: 'e' } },
        { $project: { _id: 0, id: { $toString: '$_id' }, entrenadorId: 1, inicio: 1, fin: 1, estado: 1, entrenador: { $first: '$e.nombre' }, imagen: { $first: '$e.imagen' } } },
      ]).toArray();
    },
    async cancelarReserva(usuario, reservaId) {
      const _id = comoId(reservaId);
      if (!_id) throw new ErrorNegocio(404, 'Reserva no encontrada.');
      const ahora = new Date();
      const r = await (await db()).collection('reservas').updateOne(
        { _id, usuarioId: comoId(usuario), estado: 'confirmada', inicio: { $gt: ahora } },
        { $set: { estado: 'cancelada', canceladaAt: ahora } },
      );
      if (!r.matchedCount) throw new ErrorNegocio(404, 'No hay una cita futura con ese identificador.');
    },

    // ---------- rutinas y máquinas ----------
    async listarRutinas(objetivo) {
      return (await db()).collection('rutinas')
        .find(objetivo ? { objetivo } : {}, { projection: { ejercicios: 0 } })
        .sort({ objetivo: 1, nivel: 1 }).toArray();
    },
    async obtenerRutina(id) {
      return (await db()).collection('rutinas').findOne({ _id: id });
    },
    async listarMaquinas() {
      return (await db()).collection('maquinas').find().toArray();
    },

    // ---------- tienda ----------
    async listarProductos() {
      return (await db()).collection('productos').find({ activo: true }).sort({ precio: -1 }).toArray();
    },
    async obtenerCarrito(usuario) {
      return carritoDetallado(await db(), comoId(usuario));
    },
    async guardarCarrito(usuario, items) {
      const base = await db();
      const usuarioId = comoId(usuario);
      const cantidades = new Map();
      for (const { productoId, cantidad } of items) cantidades.set(productoId, Math.min(20, (cantidades.get(productoId) ?? 0) + cantidad));
      const existentes = await base.collection('productos').countDocuments({ _id: { $in: [...cantidades.keys()] }, activo: true });
      if (existentes !== cantidades.size) throw new ErrorNegocio(400, 'El carrito contiene productos que no existen.');
      await base.collection('carritos').updateOne(
        { _id: usuarioId },
        { $set: { items: [...cantidades].map(([productoId, cantidad]) => ({ productoId, cantidad })), updatedAt: new Date() } },
        { upsert: true },
      );
      return carritoDetallado(base, usuarioId);
    },
    async crearPedido(usuario) {
      const usuarioId = comoId(usuario);
      return transaccion(async (base, session) => {
        const { items, total } = await carritoDetallado(base, usuarioId, session);
        if (!items.length) throw new ErrorNegocio(400, 'Tu carrito está vacío.');
        for (const item of items) {
          // Descuento condicional: si otra compra agotó el stock, la transacción completa se revierte.
          const r = await base.collection('productos').updateOne(
            { _id: item.productoId, activo: true, stock: { $gte: item.cantidad } },
            { $inc: { stock: -item.cantidad } },
            { session },
          );
          if (!r.matchedCount) throw new ErrorNegocio(409, `No hay unidades suficientes de ${item.nombre}.`);
        }
        const pedido = {
          usuarioId,
          items: items.map(({ productoId, nombre, precio, cantidad, subtotal }) => ({ productoId, nombre, precioUnitario: precio, cantidad, subtotal })),
          total, estado: 'pagado', referencia: referencia(), createdAt: new Date(),
        };
        const { insertedId } = await base.collection('pedidos').insertOne(pedido, { session });
        await base.collection('carritos').updateOne({ _id: usuarioId }, { $set: { items: [], updatedAt: new Date() } }, { session });
        const { usuarioId: _omitido, ...publico } = pedido;
        return { id: insertedId.toString(), ...publico };
      });
    },
    async listarPedidos(usuario) {
      const pedidos = await (await db()).collection('pedidos')
        .find({ usuarioId: comoId(usuario) }, { projection: { usuarioId: 0 } })
        .sort({ createdAt: -1 }).limit(30).toArray();
      return pedidos.map(({ _id, ...p }) => ({ id: _id.toString(), ...p }));
    },

    async preparar() {
      await db();
    },
    async ping() {
      // El driver conecta automáticamente y reutiliza el pool.
      // Cada petición ejecuta un comando real; no devuelve un estado cacheado.
      await getDb().command({ ping: 1 });
    },
    async close() {
      await client?.close();
    },
  };
}
