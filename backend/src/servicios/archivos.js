// Persistencia dual de archivos: el contenido vive en disco (comprobantes PDF) o en GridFS (fotos de perfil)
// y sus metadatos en la colección `archivos` (nombre UUID, peso, ruta, fecha, autor, módulo, operación y SHA-256).
//
// Reglas:
// - Un archivo por operación: el índice único { modulo, operacion } impide duplicados, también con peticiones simultáneas.
// - Al abrir un archivo se recalcula su SHA-256. Si un comprobante falta en disco o fue alterado, se vuelve a
//   dibujar con los datos guardados y solo se entrega si su hash coincide con el registrado.
import { GridFSBucket, ObjectId } from 'mongodb';
import { sha256 } from '../almacenamiento/disco.js';
import { ErrorNegocio } from '../errores.js';
import { EXTENSION_FOTO } from '../esquema.js';
import { sumarMeses } from '../fechas.js';
import { repositorioArchivos as repo } from '../repositorios/archivos.js';
import { datosMembresia, datosPedido, datosReserva, dibujarComprobante, tituloComprobante } from './comprobantes.js';

export const MODULOS = ['membresias', 'reservas', 'pedidos', 'perfil'];
export const extensionFoto = tipo => EXTENSION_FOTO[tipo];

// Cada cita se identifica en su comprobante con una referencia corta derivada de su id.
export const referenciaReserva = id => `CITA-${String(id).slice(-8).toUpperCase()}`;
const operacionFoto = archivoId => `foto-${archivoId}`;

// Periodo que cubre cada pago de una membresía. Se reconstruye igual que lo calcula la compra:
// la compra empieza en fechaInicio y cada extensión o renovación continúa donde terminó el pago anterior.
export function periodosDePagos(membresia) {
  let hasta = null;
  return membresia.pagos.map(pago => {
    const precio = membresia.plan.precioMensual;
    const meses = precio > 0 ? Math.max(1, Math.round(pago.monto / precio)) : membresia.meses;
    const desde = pago.tipo === 'compra' || !hasta ? membresia.fechaInicio : hasta;
    hasta = sumarMeses(desde, meses);
    return { pago, meses, periodo: { desde, hasta } };
  });
}

// Forma pública de un archivo (sin la ruta interna ni los datos del comprobante).
export function archivoPublico(a) {
  const id = a._id.toString();
  return {
    id, nombre: a.nombre, titulo: a.titulo, tipo: a.tipo, peso: a.peso, fecha: a.fecha,
    modulo: a.modulo, operacion: a.operacion, sha256: a.sha256,
    url: `/api/archivos/${id}`, descarga: `/api/archivos/${id}?descargar=1`,
  };
}

async function leerGridfs(base, ruta) {
  const id = ruta.startsWith('fotos/') ? ruta.slice(6) : '';
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const partes = [];
  try {
    for await (const parte of new GridFSBucket(base, { bucketName: 'fotos' }).openDownloadStream(new ObjectId(id))) partes.push(parte);
  } catch (error) {
    if (/FileNotFound|file not found/i.test(`${error.code} ${error.message}`)) return null;
    throw error;
  }
  return Buffer.concat(partes);
}

export function crearServicioArchivos({ disco }) {
  async function cliente(base, autor) {
    const u = await base.collection('usuarios').findOne({ _id: autor }, { projection: { nombre: 1, correo: 1 } });
    return u ? { nombre: u.nombre, correo: u.correo } : null;
  }

  // Genera el PDF, lo guarda en disco con nombre UUID y registra sus metadatos. Idempotente por operación.
  async function emitir(base, { autor, modulo, operacion, datos }) {
    const existente = await repo.porOperacion(base, modulo, operacion);
    if (existente) return existente;
    const guardado = await disco.guardar('comprobantes', 'pdf', dibujarComprobante(datos));
    const archivo = {
      nombre: guardado.nombre, titulo: tituloComprobante(datos), tipo: 'application/pdf', peso: guardado.peso,
      ruta: guardado.ruta, almacen: 'disco', fecha: new Date(), autor, modulo, operacion, sha256: guardado.sha256, datos,
    };
    try {
      return await repo.insertar(base, archivo);
    } catch (error) {
      // Si otra petición ganó la carrera, su registro es el válido y este fichero sobra.
      await disco.eliminar(guardado.ruta).catch(() => {});
      if (error.code === 11000) return repo.porOperacion(base, modulo, operacion);
      throw error;
    }
  }

  async function deMembresias(base, autor, membresias, datosCliente) {
    const referencias = membresias.flatMap(m => m.pagos.map(p => p.referencia));
    const hechos = await repo.operacionesConArchivo(base, 'membresias', referencias);
    if (hechos.size === referencias.length) return;
    const c = datosCliente ?? await cliente(base, autor);
    if (!c) return;
    for (const membresia of membresias) {
      for (const { pago, meses, periodo } of periodosDePagos(membresia)) {
        if (hechos.has(pago.referencia)) continue;
        const datos = datosMembresia({ cliente: c, membresia, pago, meses, periodo });
        await emitir(base, { autor, modulo: 'membresias', operacion: pago.referencia, datos });
      }
    }
  }

  async function deReservas(base, autor, reservas, datosCliente) {
    const hechos = await repo.operacionesConArchivo(base, 'reservas', reservas.map(r => r._id.toString()));
    const pendientes = reservas.filter(r => !hechos.has(r._id.toString()));
    if (!pendientes.length) return;
    const c = datosCliente ?? await cliente(base, autor);
    if (!c) return;
    const ids = [...new Set(pendientes.map(r => r.entrenadorId))];
    const entrenadores = new Map((await base.collection('entrenadores').find({ _id: { $in: ids } }).toArray()).map(e => [e._id, e]));
    for (const reserva of pendientes) {
      const entrenador = entrenadores.get(reserva.entrenadorId);
      if (!entrenador) continue;
      const datos = datosReserva({ cliente: c, reserva, entrenador, referencia: referenciaReserva(reserva._id) });
      await emitir(base, { autor, modulo: 'reservas', operacion: reserva._id.toString(), datos });
    }
  }

  async function dePedidos(base, autor, pedidos, datosCliente) {
    const hechos = await repo.operacionesConArchivo(base, 'pedidos', pedidos.map(p => p.referencia));
    const pendientes = pedidos.filter(p => !hechos.has(p.referencia));
    if (!pendientes.length) return;
    const c = datosCliente ?? await cliente(base, autor);
    if (!c) return;
    for (const pedido of pendientes) {
      await emitir(base, { autor, modulo: 'pedidos', operacion: pedido.referencia, datos: datosPedido({ cliente: c, pedido }) });
    }
  }

  return {
    deMembresias,
    deReservas,
    dePedidos,

    // Completa los comprobantes que falten de las operaciones recientes de un usuario
    // (compras hechas antes de que existieran los comprobantes, o si falló la generación en su momento).
    async sincronizar(base, autor) {
      const c = await cliente(base, autor);
      if (!c) return;
      const [membresias, reservas, pedidos] = await Promise.all([
        base.collection('membresias').find({ usuarioId: autor }).sort({ fechaInicio: -1 }).limit(20).toArray(),
        base.collection('reservas').find({ usuarioId: autor }).sort({ inicio: -1 }).limit(50).toArray(),
        base.collection('pedidos').find({ usuarioId: autor }).sort({ createdAt: -1 }).limit(30).toArray(),
      ]);
      await deMembresias(base, autor, membresias, c);
      await deReservas(base, autor, reservas, c);
      await dePedidos(base, autor, pedidos, c);
    },

    async porOperacion(base, modulo, operacion) {
      const archivo = await repo.porOperacion(base, modulo, operacion);
      return archivo ? archivoPublico(archivo) : null;
    },
    // Mapa operación → URL del archivo, para enlazar cada pago, cita o pedido con su comprobante.
    async urlsPorOperacion(base, modulo, operaciones) {
      const docs = await repo.deOperaciones(base, modulo, operaciones);
      return new Map(docs.map(a => [a.operacion, archivoPublico(a).url]));
    },

    async listar(base, autor, { modulo } = {}) {
      return (await repo.listarDelAutor(base, autor, { modulo })).map(archivoPublico);
    },

    // Contenido verificado con SHA-256. Devuelve null si el archivo no existe o no es del usuario.
    async abrir(base, autor, id) {
      const archivo = await repo.delAutor(base, autor, id);
      if (!archivo) return null;
      const contenido = archivo.almacen === 'gridfs' ? await leerGridfs(base, archivo.ruta) : await disco.leer(archivo.ruta);
      if (contenido && sha256(contenido) === archivo.sha256) return { archivo, contenido };
      if (archivo.almacen !== 'disco' || !archivo.datos) {
        if (contenido) throw new ErrorNegocio(500, 'El archivo no pasó la verificación de integridad (SHA-256).');
        throw new ErrorNegocio(410, 'El archivo ya no está disponible.');
      }
      // Comprobante perdido (disco efímero del hosting) o alterado: se regenera y se exige el mismo hash.
      const regenerado = dibujarComprobante(archivo.datos);
      if (sha256(regenerado) !== archivo.sha256) throw new ErrorNegocio(500, 'El comprobante no pasó la verificación de integridad (SHA-256).');
      await disco.escribir(archivo.ruta, regenerado);
      console.warn(`[archivos] ${archivo.ruta} ${contenido ? 'estaba alterado' : 'no estaba en disco'}: se regeneró y su SHA-256 coincide.`);
      return { archivo, contenido: regenerado, restaurado: true };
    },

    // Foto de perfil: el contenido está en GridFS; aquí se registran sus metadatos.
    async registrarFoto(base, { autor, archivoId, nombre, tipo, peso, sha256: huella, fecha }) {
      return repo.insertar(base, {
        nombre, titulo: `Foto de perfil.${extensionFoto(tipo)}`, tipo, peso, ruta: `fotos/${archivoId}`, almacen: 'gridfs',
        fecha, autor, modulo: 'perfil', operacion: operacionFoto(archivoId), sha256: huella,
      });
    },
    async olvidarFoto(base, archivoId) {
      await repo.eliminarPorOperacion(base, 'perfil', operacionFoto(archivoId));
    },
  };
}
