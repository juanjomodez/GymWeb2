import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import { crearDisco, sha256 } from './almacenamiento/disco.js';
import { ErrorNegocio } from './errores.js';
import { EXTENSION_FOTO, asegurarEsquema } from './esquema.js';
import { sumarMeses } from './fechas.js';
import { sembrarCatalogo } from './catalogo.js';
import { crearServicioArchivos } from './servicios/archivos.js';

export { ErrorNegocio, sumarMeses };

// Carpeta por defecto de los ficheros (comprobantes PDF): backend/almacenamiento/. Se cambia con ALMACENAMIENTO_DIR.
export const ALMACENAMIENTO_POR_DEFECTO = fileURLToPath(new URL('../almacenamiento/', import.meta.url));

// El gimnasio está en Cali (UTC−5, sin horario de verano): las horas de los entrenadores son locales.
const DESFASE_CALI = 5 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;
const DIAS_RESERVA = 30;
const MAX_RESERVAS_FUTURAS = 4;
export const MESES_VALIDOS = [1, 3, 6, 12];

const referencia = () => `GF-${randomBytes(5).toString('hex').toUpperCase()}`;
const comoId = id => (id instanceof ObjectId ? id : ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null);

// Fecha "YYYY-MM-DD" + "HH:00" en hora de Cali → Date (UTC).
const instante = (fecha, hora) => new Date(`${fecha}T${hora}:00-05:00`);
const diaIso = fecha => new Date(`${fecha}T12:00:00-05:00`).getUTCDay() || 7;
const local = d => new Date(d.getTime() - DESFASE_CALI);
const fechaLocal = d => local(d).toISOString().slice(0, 10);
const horaLocal = d => local(d).toISOString().slice(11, 16);

// Datos del perfil que puede ver y editar su dueño (nunca el hash de la contraseña).
function publicoPerfil(u) {
  if (!u) return null;
  return {
    id: u._id.toString(), nombre: u.nombre, correo: u.correo,
    telefono: u.telefono ?? '', objetivo: u.objetivo ?? '', fotoUrl: u.foto?.url ?? null,
  };
}
const PROYECCION_PERFIL = { nombre: 1, correo: 1, telefono: 1, objetivo: 1, foto: 1 };

// `comprobantes`: Map referencia del pago → URL de su comprobante PDF (si ya existe).
function publicaMembresia(m, comprobantes = new Map()) {
  if (!m) return null;
  const { _id, usuarioId, pagos, ...resto } = m;
  return {
    id: _id.toString(), ...resto,
    pagos: pagos.map(({ referencia: r, monto, fecha, tipo }) => ({ referencia: r, monto, fecha, tipo, comprobante: comprobantes.get(r) ?? null })),
  };
}

// Los comprobantes son un efecto secundario: si fallan, la compra o la cita ya quedó guardada y no se revierte.
// El error queda en el log y el comprobante se completa después (al abrir la sección o listar los archivos).
async function intentar(descripcion, fn) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[archivos] ${descripcion}:`, error.message);
    return null;
  }
}

export function createDatabase({ uri, database, almacenamiento = ALMACENAMIENTO_POR_DEFECTO }) {
  let client;
  let preparado;
  const archivos = crearServicioArchivos({ disco: crearDisco(almacenamiento) });
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
      const user = await base.collection('usuarios').findOne({ _id: userId }, { projection: { nombre: 1, correo: 1, rol: 1, 'foto.url': 1 } });
      return user ? { id: user._id.toString(), nombre: user.nombre, correo: user.correo, rol: user.rol ?? 'cliente', fotoUrl: user.foto?.url ?? null } : null;
    },
    async deleteSession(tokenHash) {
      await (await db()).collection('sesiones').deleteOne({ _id: tokenHash });
    },

    // ---------- perfil y foto de perfil ----------
    async obtenerPerfil(usuario) {
      const u = await (await db()).collection('usuarios').findOne({ _id: comoId(usuario) }, { projection: PROYECCION_PERFIL });
      return publicoPerfil(u);
    },
    // `cambios`: { nombre?, telefono?, objetivo? } ya validados; '' en telefono/objetivo los borra.
    async actualizarPerfil(usuario, cambios) {
      const $set = { updatedAt: new Date() };
      const $unset = {};
      for (const [campo, valor] of Object.entries(cambios)) {
        if (valor === '') $unset[campo] = '';
        else $set[campo] = valor;
      }
      const u = await (await db()).collection('usuarios').findOneAndUpdate(
        { _id: comoId(usuario) },
        { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
        { returnDocument: 'after', projection: PROYECCION_PERFIL },
      );
      return publicoPerfil(u);
    },
    // Guarda la imagen en GridFS (bucket `fotos`) con nombre UUID y su SHA-256, registra sus metadatos en
    // `archivos` y la enlaza en el usuario. Si algo falla se deshace lo hecho; al final borra la foto anterior.
    async guardarFotoPerfil(usuario, { buffer, tipo }) {
      const base = await db();
      const usuarioId = comoId(usuario);
      const bucket = new GridFSBucket(base, { bucketName: 'fotos' });
      const archivoId = new ObjectId();
      const huella = sha256(buffer);
      const nombre = `${randomUUID()}.${EXTENSION_FOTO[tipo]}`;
      const subidaAt = new Date();
      await new Promise((resolve, reject) => {
        bucket.openUploadStreamWithId(archivoId, nombre, { contentType: tipo, metadata: { usuarioId, tipo, sha256: huella } })
          .on('finish', resolve).on('error', reject).end(buffer);
      });
      const deshacer = async () => {
        await archivos.olvidarFoto(base, archivoId).catch(() => {});
        await bucket.delete(archivoId).catch(() => {});
      };
      const foto = { archivoId, url: `/api/fotos/${archivoId}`, tipo, tamano: buffer.length, nombre, sha256: huella, subidaAt };
      let anterior;
      try {
        await archivos.registrarFoto(base, { autor: usuarioId, archivoId, nombre, tipo, peso: buffer.length, sha256: huella, fecha: subidaAt });
        anterior = await base.collection('usuarios').findOneAndUpdate(
          { _id: usuarioId }, { $set: { foto, updatedAt: subidaAt } }, { projection: { foto: 1 } },
        );
      } catch (error) {
        await deshacer();
        throw error;
      }
      if (!anterior) {
        await deshacer();
        throw new ErrorNegocio(404, 'Usuario no encontrado.');
      }
      if (anterior.foto?.archivoId) {
        await bucket.delete(anterior.foto.archivoId).catch(() => {});
        await archivos.olvidarFoto(base, anterior.foto.archivoId).catch(() => {});
      }
      return this.obtenerPerfil(usuarioId);
    },
    async eliminarFotoPerfil(usuario) {
      const base = await db();
      const anterior = await base.collection('usuarios').findOneAndUpdate(
        { _id: comoId(usuario) }, { $unset: { foto: '' }, $set: { updatedAt: new Date() } }, { projection: { foto: 1 } },
      );
      if (anterior?.foto?.archivoId) {
        await new GridFSBucket(base, { bucketName: 'fotos' }).delete(anterior.foto.archivoId).catch(() => {});
        await archivos.olvidarFoto(base, anterior.foto.archivoId).catch(() => {});
      }
    },
    // Devuelve { tipo, tamano, sha256, stream } o null si la foto no existe.
    async abrirFoto(id) {
      const archivoId = comoId(id);
      if (!archivoId) return null;
      const bucket = new GridFSBucket(await db(), { bucketName: 'fotos' });
      const archivo = await bucket.find({ _id: archivoId }).next();
      if (!archivo) return null;
      return {
        tipo: archivo.contentType ?? archivo.metadata?.tipo, tamano: archivo.length, sha256: archivo.metadata?.sha256 ?? null,
        stream: bucket.openDownloadStream(archivoId),
      };
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
      // Genera los comprobantes que falten: renovaciones automáticas recién aplicadas o compras anteriores a esta función.
      await intentar('comprobantes de membresía', () => archivos.deMembresias(base, usuarioId, historial));
      const comprobantes = await archivos.urlsPorOperacion(base, 'membresias', historial.flatMap(m => m.pagos.map(p => p.referencia)));
      const actual = historial.find(m => m.estado === 'activa');
      return { actual: publicaMembresia(actual, comprobantes), historial: historial.map(m => publicaMembresia(m, comprobantes)) };
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
      // El comprobante se genera después de confirmar la transacción (los reintentos no deben escribir ficheros).
      const base = await db();
      await intentar('comprobante de membresía', () => archivos.deMembresias(base, usuarioId, [membresia]));
      const comprobantes = await archivos.urlsPorOperacion(base, 'membresias', membresia.pagos.map(p => p.referencia));
      return publicaMembresia(membresia, comprobantes);
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
      return publicaMembresia(m, await archivos.urlsPorOperacion(base, 'membresias', m.pagos.map(p => p.referencia)));
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
      let insertedId;
      try {
        ({ insertedId } = await base.collection('reservas').insertOne(reserva));
      } catch (error) {
        if (error.code !== 11000) throw error;
        throw new ErrorNegocio(409, error.keyPattern?.usuarioId ? 'Ya tienes otra cita a esa hora.' : 'Ese horario acaba de ser reservado. Elige otro.');
      }
      const id = insertedId.toString();
      await intentar('comprobante de cita', () => archivos.deReservas(base, usuarioId, [{ ...reserva, _id: insertedId }]));
      const comprobante = (await archivos.urlsPorOperacion(base, 'reservas', [id])).get(id) ?? null;
      return { id, entrenadorId, entrenador: entrenador.nombre, inicio, fin: reserva.fin, estado: reserva.estado, comprobante };
    },
    async listarReservas(usuario) {
      const base = await db();
      const reservas = await base.collection('reservas').aggregate([
        { $match: { usuarioId: comoId(usuario) } },
        { $sort: { inicio: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'entrenadores', localField: 'entrenadorId', foreignField: '_id', as: 'e' } },
        { $project: { _id: 0, id: { $toString: '$_id' }, entrenadorId: 1, inicio: 1, fin: 1, estado: 1, entrenador: { $first: '$e.nombre' }, imagen: { $first: '$e.imagen' } } },
      ]).toArray();
      const comprobantes = await archivos.urlsPorOperacion(base, 'reservas', reservas.map(r => r.id));
      return reservas.map(r => ({ ...r, comprobante: comprobantes.get(r.id) ?? null }));
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
      const pedido = await transaccion(async (base, session) => {
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
        return { ...pedido, _id: insertedId };
      });
      const base = await db();
      await intentar('comprobante de pedido', () => archivos.dePedidos(base, usuarioId, [pedido]));
      const comprobante = (await archivos.urlsPorOperacion(base, 'pedidos', [pedido.referencia])).get(pedido.referencia) ?? null;
      const { _id, usuarioId: _omitido, ...publico } = pedido;
      return { id: _id.toString(), ...publico, comprobante };
    },
    async listarPedidos(usuario) {
      const base = await db();
      const pedidos = await base.collection('pedidos')
        .find({ usuarioId: comoId(usuario) }, { projection: { usuarioId: 0 } })
        .sort({ createdAt: -1 }).limit(30).toArray();
      const comprobantes = await archivos.urlsPorOperacion(base, 'pedidos', pedidos.map(p => p.referencia));
      return pedidos.map(({ _id, ...p }) => ({ id: _id.toString(), ...p, comprobante: comprobantes.get(p.referencia) ?? null }));
    },

    // ---------- archivos (comprobantes PDF y fotos de perfil) ----------
    // Antes de listar se generan los comprobantes que falten (operaciones antiguas o generaciones fallidas).
    async listarArchivos(usuario, { modulo } = {}) {
      const base = await db();
      const autor = comoId(usuario);
      await intentar('sincronizar comprobantes', () => archivos.sincronizar(base, autor));
      return archivos.listar(base, autor, { modulo });
    },
    // { archivo, contenido } verificado con SHA-256, o null si no existe o es de otro usuario.
    async abrirArchivo(usuario, id) {
      return archivos.abrir(await db(), comoId(usuario), id);
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
