// Comprobantes PDF de las operaciones: compra/extensión/renovación de membresía, cita con entrenador y pedido de la tienda.
//
// Cada comprobante se describe con un objeto `datos` que ya trae los textos formateados. Ese objeto se guarda
// junto a los metadatos del archivo: si el PDF desaparece del disco se vuelve a dibujar con los mismos datos
// y, como el generador es determinista, el SHA-256 coincide con el original.
import { A4, anchoTexto, crearPagina, documentoPdf, partirLineas } from '../almacenamiento/pdf.js';

export const PLANTILLA = 1;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
// Formato propio (no Intl): la salida no puede cambiar entre versiones de Node/ICU o el hash dejaría de coincidir.
const enCali = fecha => new Date(new Date(fecha).getTime() - 5 * 3600e3);
const dosDigitos = valor => String(valor).padStart(2, '0');
export const dinero = valor => `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
export const fechaLarga = fecha => {
  const d = enCali(fecha);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};
const hora = fecha => {
  const d = enCali(fecha);
  return `${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}`;
};
export const fechaHora = fecha => `${fechaLarga(fecha)}, ${hora(fecha)}`;
const diaSemana = fecha => DIAS[enCali(fecha).getUTCDay()];
const plural = (cantidad, singular, varios) => `${cantidad} ${cantidad === 1 ? singular : varios}`;

const CONCEPTO_PAGO = {
  compra: 'Compra de membresía',
  extension: 'Extensión de membresía',
  renovacion: 'Renovación automática',
};

// ---------- datos de cada tipo de comprobante ----------

// `pago`: { referencia, monto, fecha, tipo }; `meses` y `periodo` ({ desde, hasta }): lo que cubre ese pago.
export function datosMembresia({ cliente, membresia, pago, meses, periodo }) {
  return {
    plantilla: PLANTILLA,
    tipo: 'membresia',
    referencia: pago.referencia,
    fecha: pago.fecha,
    encabezado: 'Comprobante de pago',
    titulo: membresia.plan.nombre,
    subtitulo: CONCEPTO_PAGO[pago.tipo],
    cliente,
    filas: [
      { etiqueta: 'Concepto', valor: CONCEPTO_PAGO[pago.tipo] },
      { etiqueta: 'Plan', valor: membresia.plan.nombre },
      { etiqueta: 'Duración', valor: plural(meses, 'mes', 'meses') },
      { etiqueta: 'Precio mensual', valor: dinero(membresia.plan.precioMensual) },
      { etiqueta: 'Vigencia', valor: `${fechaLarga(periodo.desde)} al ${fechaLarga(periodo.hasta)}` },
      { etiqueta: 'Personas incluidas', valor: String(membresia.plan.maxPersonas) },
      { etiqueta: 'Entrenador personal', valor: membresia.plan.incluyeEntrenador ? 'Incluido' : 'No incluido' },
      { etiqueta: 'Fecha de pago', valor: fechaHora(pago.fecha) },
    ],
    total: { etiqueta: 'Total pagado', valor: dinero(pago.monto) },
    nota: pago.tipo === 'renovacion'
      ? 'Renovación generada automáticamente porque tenías activada la renovación automática. Puedes desactivarla en Mi cuenta.'
      : 'Tu membresía queda activa desde la fecha de pago. Presenta tu correo registrado en la recepción.',
  };
}

export function datosReserva({ cliente, reserva, entrenador, referencia }) {
  return {
    plantilla: PLANTILLA,
    tipo: 'reserva',
    referencia,
    fecha: reserva.createdAt,
    encabezado: 'Comprobante de cita',
    titulo: `Cita con ${entrenador.nombre}`,
    subtitulo: entrenador.especialidad,
    cliente,
    filas: [
      { etiqueta: 'Entrenador', valor: entrenador.nombre },
      { etiqueta: 'Especialidad', valor: entrenador.especialidad },
      { etiqueta: 'Zona', valor: entrenador.zona },
      { etiqueta: 'Día', valor: `${diaSemana(reserva.inicio)}, ${fechaLarga(reserva.inicio)}` },
      { etiqueta: 'Horario', valor: `${hora(reserva.inicio)} a ${hora(reserva.fin)} (hora de Cali)` },
      { etiqueta: 'Reservada el', valor: fechaHora(reserva.createdAt) },
    ],
    total: { etiqueta: 'Costo de la cita', valor: 'Incluida en tu plan' },
    nota: 'Llega 10 minutos antes. Puedes cancelar la cita desde Mi cuenta mientras no haya empezado.',
  };
}

export function datosPedido({ cliente, pedido }) {
  const unidades = pedido.items.reduce((suma, item) => suma + item.cantidad, 0);
  return {
    plantilla: PLANTILLA,
    tipo: 'pedido',
    referencia: pedido.referencia,
    fecha: pedido.createdAt,
    encabezado: 'Comprobante de compra',
    titulo: 'Compra en la tienda',
    subtitulo: plural(unidades, 'producto', 'productos'),
    cliente,
    filas: [
      { etiqueta: 'Fecha de compra', valor: fechaHora(pedido.createdAt) },
      { etiqueta: 'Entrega', valor: 'Recoger en la recepción del gimnasio' },
    ],
    items: pedido.items.map(item => ({
      nombre: item.nombre,
      cantidad: String(item.cantidad),
      precio: dinero(item.precioUnitario),
      subtotal: dinero(item.subtotal),
    })),
    total: { etiqueta: 'Total pagado', valor: dinero(pedido.total) },
    nota: 'Conserva este comprobante: lo pedirán en la recepción para entregarte tus productos.',
  };
}

// ---------- dibujo ----------

const OSCURO = [0.043, 0.043, 0.051];
const ROJO = [0.929, 0.11, 0.141];
const TEXTO = [0.09, 0.09, 0.11];
const TENUE = [0.42, 0.42, 0.45];
const CLARO = [0.72, 0.71, 0.71];
const LINEA = [0.87, 0.87, 0.89];
const FONDO = [0.965, 0.962, 0.958];
const BLANCO = [1, 1, 1];
const IZQ = 48;
const DER = A4.ancho - 48;
const MAX_FILAS_PRODUCTOS = 16;

export function dibujarComprobante(datos) {
  if (datos.plantilla !== PLANTILLA) throw new Error(`Plantilla de comprobante no soportada: ${datos.plantilla}`);
  const p = crearPagina();

  // Cabecera
  p.rect(0, A4.alto - 84, A4.ancho, 84, OSCURO);
  p.rect(0, A4.alto - 88, A4.ancho, 4, ROJO);
  p.texto(IZQ, A4.alto - 46, 'Gym', { tamano: 26, negrita: true, relleno: BLANCO });
  p.texto(IZQ + anchoTexto('Gym', 26, true), A4.alto - 46, 'Flow', { tamano: 26, negrita: true, relleno: ROJO });
  p.texto(IZQ, A4.alto - 64, 'Gimnasio  •  Cali, Colombia', { tamano: 9, relleno: CLARO });
  p.texto(DER, A4.alto - 38, datos.encabezado.toUpperCase(), { tamano: 9, negrita: true, relleno: CLARO, alinear: 'der' });
  p.texto(DER, A4.alto - 56, datos.referencia, { tamano: 14, negrita: true, relleno: BLANCO, alinear: 'der' });
  p.texto(DER, A4.alto - 70, fechaHora(datos.fecha), { tamano: 9, relleno: CLARO, alinear: 'der' });

  // Título
  let y = A4.alto - 132;
  for (const linea of partirLineas(datos.titulo, DER - IZQ, 20, true)) {
    p.texto(IZQ, y, linea, { tamano: 20, negrita: true, relleno: TEXTO });
    y -= 24;
  }
  if (datos.subtitulo) p.texto(IZQ, y + 4, datos.subtitulo, { tamano: 11, relleno: TENUE });

  // Cliente
  y -= 30;
  p.rect(IZQ, y - 40, DER - IZQ, 52, FONDO);
  p.texto(IZQ + 14, y - 2, 'CLIENTE', { tamano: 8, negrita: true, relleno: TENUE });
  p.texto(IZQ + 14, y - 18, datos.cliente.nombre, { tamano: 11, negrita: true, relleno: TEXTO });
  p.texto(IZQ + 14, y - 32, datos.cliente.correo, { tamano: 9.5, relleno: TENUE });

  // Detalle (etiqueta a la izquierda, valor alineado a la derecha y partido si es largo)
  y -= 72;
  p.texto(IZQ, y, 'DETALLE', { tamano: 8, negrita: true, relleno: TENUE });
  y -= 8;
  for (const fila of datos.filas) {
    const lineas = partirLineas(fila.valor, 300, 10, true);
    y -= 18;
    p.texto(IZQ, y, fila.etiqueta, { tamano: 10, relleno: TENUE });
    lineas.forEach((linea, i) => p.texto(DER, y - i * 13, linea, { tamano: 10, negrita: true, relleno: TEXTO, alinear: 'der' }));
    y -= (lineas.length - 1) * 13 + 8;
    p.linea(IZQ, y, DER, y, LINEA);
  }

  // Productos (solo pedidos)
  if (datos.items?.length) {
    y -= 30;
    p.rect(IZQ, y - 7, DER - IZQ, 22, FONDO);
    p.texto(IZQ + 10, y, 'PRODUCTO', { tamano: 8, negrita: true, relleno: TENUE });
    p.texto(340, y, 'CANT.', { tamano: 8, negrita: true, relleno: TENUE, alinear: 'der' });
    p.texto(445, y, 'PRECIO UNIT.', { tamano: 8, negrita: true, relleno: TENUE, alinear: 'der' });
    p.texto(DER - 10, y, 'SUBTOTAL', { tamano: 8, negrita: true, relleno: TENUE, alinear: 'der' });
    y -= 7;
    const visibles = datos.items.length > MAX_FILAS_PRODUCTOS ? datos.items.slice(0, MAX_FILAS_PRODUCTOS - 1) : datos.items;
    for (const item of visibles) {
      y -= 20;
      p.texto(IZQ + 10, y, partirLineas(item.nombre, 230, 10)[0], { tamano: 10, relleno: TEXTO });
      p.texto(340, y, item.cantidad, { tamano: 10, relleno: TEXTO, alinear: 'der' });
      p.texto(445, y, item.precio, { tamano: 10, relleno: TEXTO, alinear: 'der' });
      p.texto(DER - 10, y, item.subtotal, { tamano: 10, negrita: true, relleno: TEXTO, alinear: 'der' });
      y -= 8;
      p.linea(IZQ, y, DER, y, LINEA);
    }
    if (visibles.length < datos.items.length) {
      y -= 20;
      p.texto(IZQ + 10, y, `… y ${plural(datos.items.length - visibles.length, 'producto más', 'productos más')} (incluidos en el total)`, { tamano: 9.5, relleno: TENUE });
      y -= 8;
    }
  }

  // Total
  y -= 30;
  p.rect(IZQ, y - 22, DER - IZQ, 40, OSCURO);
  p.rect(IZQ, y - 22, 4, 40, ROJO);
  p.texto(IZQ + 18, y - 6, datos.total.etiqueta, { tamano: 11, negrita: true, relleno: BLANCO });
  p.texto(DER - 16, y - 7, datos.total.valor, { tamano: 15, negrita: true, relleno: BLANCO, alinear: 'der' });

  // Nota
  y -= 50;
  for (const linea of partirLineas(datos.nota, DER - IZQ, 9.5)) {
    p.texto(IZQ, y, linea, { tamano: 9.5, relleno: TENUE });
    y -= 13;
  }

  // Pie
  p.linea(IZQ, 70, DER, 70, LINEA);
  p.texto(IZQ, 54, 'Pago simulado con fines académicos: no se realizó ningún cobro real.', { tamano: 8, relleno: TENUE });
  p.texto(IZQ, 42, 'Comprobante generado por GymFlow. Su huella SHA-256 queda registrada para verificar que no ha sido modificado.', { tamano: 8, relleno: TENUE });
  p.texto(DER, 54, datos.referencia, { tamano: 8, negrita: true, relleno: TEXTO, alinear: 'der' });

  return documentoPdf(p, {
    titulo: `${datos.encabezado} ${datos.referencia}`,
    asunto: datos.titulo,
    autor: 'GymFlow',
    fecha: datos.fecha,
  });
}

// Nombre legible para la descarga (el fichero en disco siempre se llama <uuid>.pdf).
export const tituloComprobante = datos => `Comprobante ${datos.referencia}.pdf`;
