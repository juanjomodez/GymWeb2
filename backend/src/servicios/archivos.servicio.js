// Persistencia dual de archivos: el contenido vive en disco (comprobantes PDF) o en GridFS (fotos de perfil)
// y sus metadatos en la colección `archivos` (nombre UUID, peso, ruta, fecha, autor, módulo, operación y SHA-256).
//
// Reglas:
// - Un archivo por operación: el índice único { modulo, operacion } impide duplicados, también con peticiones simultáneas.
// - Al abrir un archivo se recalcula su SHA-256. Si un comprobante falta en disco o fue alterado, se vuelve a
//   dibujar con los datos guardados y solo se entrega si su hash coincide con el registrado.
// - Los comprobantes son un efecto secundario: si fallan, la compra o la cita ya quedó guardada y no se revierte.
//   El error queda en el log y el comprobante se completa después (al abrir la sección o listar los archivos).
import { sha256 } from '../almacenamiento/disco.js';
import { EXTENSION_FOTO } from '../esquema.js';
import { ErrorNegocio } from './errores.js';
import { sumarMeses } from './membresias.servicio.js';
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

async function intentar(descripcion, fn) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[archivos] ${descripcion}:`, error.message);
    return null;
  }
}

// `emitir: false` (seed dentro de una transacción): no se escriben ficheros; los comprobantes
// se completan la primera vez que el usuario abre su membresía, sus citas, sus compras o sus archivos.
export function crearArchivosServicio({ archivos, usuarios, membresias, reservas, pedidos, entrenadores, fotos }, { disco, emitir: emitirActivo = true }) {
  async function cliente(autor) {
    const u = await usuarios.buscarPorId(autor, { nombre: 1, correo: 1 });
    return u ? { nombre: u.nombre, correo: u.correo } : null;
  }

  // Genera el PDF, lo guarda en disco con nombre UUID y registra sus metadatos. Idempotente por operación.
  async function emitir({ autor, modulo, operacion, datos }) {
    const existente = await archivos.porOperacion(modulo, operacion);
    if (existente) return existente;
    const guardado = await disco.guardar('comprobantes', 'pdf', dibujarComprobante(datos));
    try {
      return await archivos.crear({
        nombre: guardado.nombre, titulo: tituloComprobante(datos), tipo: 'application/pdf', peso: guardado.peso,
        ruta: guardado.ruta, almacen: 'disco', fecha: new Date(), autor, modulo, operacion, sha256: guardado.sha256, datos,
      });
    } catch (error) {
      // Si otra petición ganó la carrera, su registro es el válido y este fichero sobra.
      await disco.eliminar(guardado.ruta).catch(() => {});
      if (error.code === 11000) return archivos.porOperacion(modulo, operacion);
      throw error;
    }
  }

  // Devuelve una función que dice si a una operación le falta su archivo.
  async function faltantes(modulo, operaciones) {
    const hechos = new Set((await archivos.deOperaciones(modulo, operaciones)).map(a => a.operacion));
    return operacion => !hechos.has(operacion);
  }

  async function deMembresias(autor, lista, datosCliente) {
    if (!emitirActivo || !lista.length) return;
    const falta = await faltantes('membresias', lista.flatMap(m => m.pagos.map(p => p.referencia)));
    if (!lista.some(m => m.pagos.some(p => falta(p.referencia)))) return;
    const c = datosCliente ?? await cliente(autor);
    if (!c) return;
    for (const membresia of lista) {
      for (const { pago, meses, periodo } of periodosDePagos(membresia)) {
        if (!falta(pago.referencia)) continue;
        const datos = datosMembresia({ cliente: c, membresia, pago, meses, periodo });
        await emitir({ autor, modulo: 'membresias', operacion: pago.referencia, datos });
      }
    }
  }

  async function deReservas(autor, lista, datosCliente) {
    if (!emitirActivo || !lista.length) return;
    const falta = await faltantes('reservas', lista.map(r => r._id.toString()));
    const sinComprobante = lista.filter(r => falta(r._id.toString()));
    if (!sinComprobante.length) return;
    const c = datosCliente ?? await cliente(autor);
    if (!c) return;
    const porId = new Map((await entrenadores.buscarPorIds([...new Set(sinComprobante.map(r => r.entrenadorId))])).map(e => [e._id, e]));
    for (const reserva of sinComprobante) {
      const entrenador = porId.get(reserva.entrenadorId);
      if (!entrenador) continue;
      const datos = datosReserva({ cliente: c, reserva, entrenador, referencia: referenciaReserva(reserva._id) });
      await emitir({ autor, modulo: 'reservas', operacion: reserva._id.toString(), datos });
    }
  }

  async function dePedidos(autor, lista, datosCliente) {
    if (!emitirActivo || !lista.length) return;
    const falta = await faltantes('pedidos', lista.map(p => p.referencia));
    const sinComprobante = lista.filter(p => falta(p.referencia));
    if (!sinComprobante.length) return;
    const c = datosCliente ?? await cliente(autor);
    if (!c) return;
    for (const pedido of sinComprobante) {
      await emitir({ autor, modulo: 'pedidos', operacion: pedido.referencia, datos: datosPedido({ cliente: c, pedido }) });
    }
  }

  return {
    // Ganchos para los demás servicios: nunca lanzan errores.
    comprobantesMembresias: (autor, lista) => intentar('comprobantes de membresía', () => deMembresias(autor, lista)),
    comprobantesReservas: (autor, lista) => intentar('comprobantes de citas', () => deReservas(autor, lista)),
    comprobantesPedidos: (autor, lista) => intentar('comprobantes de pedidos', () => dePedidos(autor, lista)),

    // Mapa operación → URL del archivo, para enlazar cada pago, cita o pedido con su comprobante.
    async urlsPorOperacion(modulo, operaciones) {
      return new Map((await archivos.deOperaciones(modulo, operaciones)).map(a => [a.operacion, archivoPublico(a).url]));
    },

    // Antes de listar se generan los comprobantes que falten (operaciones antiguas o generaciones fallidas).
    async listarArchivos(autor, { modulo } = {}) {
      await intentar('sincronizar comprobantes', async () => {
        const c = await cliente(autor);
        if (!c) return;
        await deMembresias(autor, await membresias.historial(autor, 20), c);
        await deReservas(autor, await reservas.listarDocumentos(autor, 50), c);
        await dePedidos(autor, await pedidos.listar(autor, 30), c);
      });
      return (await archivos.listarDelAutor(autor, { modulo })).map(archivoPublico);
    },

    // { archivo, contenido } verificado con SHA-256, o null si no existe o es de otro usuario.
    async abrirArchivo(autor, id) {
      const archivo = await archivos.delAutor(autor, id);
      if (!archivo) return null;
      const contenido = archivo.almacen === 'gridfs'
        ? await fotos.leer(archivo.ruta.replace(/^fotos\//, ''))
        : await disco.leer(archivo.ruta);
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
    async registrarFoto({ autor, archivoId, nombre, tipo, peso, sha256: huella, fecha }) {
      return archivos.crear({
        nombre, titulo: `Foto de perfil.${extensionFoto(tipo)}`, tipo, peso, ruta: `fotos/${archivoId}`, almacen: 'gridfs',
        fecha, autor, modulo: 'perfil', operacion: operacionFoto(archivoId), sha256: huella,
      });
    },
    async olvidarFoto(archivoId) {
      await archivos.eliminarPorOperacion('perfil', operacionFoto(archivoId));
    },
  };
}
