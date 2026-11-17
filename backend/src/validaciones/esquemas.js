// Esquemas de entrada de cada endpoint. Los mensajes son los que ve el usuario en la web.
import { MESES_VALIDOS } from '../servicios/membresias.servicio.js';
import { OBJETIVOS } from '../esquema.js';
import {
  booleano, contrasena, correo, entero, esquema, fechaDia, instante, lista, objectId, objeto, opcional, slug, texto, unoDe,
} from './reglas.js';

// ---------- cuenta ----------
export const registro = esquema({
  nombre: texto({ min: 2, max: 100 }),
  correo: correo(),
  password: contrasena(),
}, { mensaje: 'Revisa nombre (2–100 caracteres), correo y contraseña (8–128 caracteres).' });

export const login = esquema({
  correo: correo(),
  password: contrasena(),
}, { mensaje: 'Introduce un correo válido y una contraseña de 8–128 caracteres.' });

export const actualizarPerfil = esquema({
  nombre: opcional(texto({ min: 2, max: 100, mensaje: 'El nombre debe tener entre 2 y 100 caracteres.' })),
  telefono: opcional(texto({ max: 20, patron: /^\+?[0-9 ]{7,20}$/, permitirVacio: true, mensaje: 'El teléfono debe tener de 7 a 20 dígitos (puede empezar con +).' })),
  objetivo: opcional(unoDe(OBJETIVOS, { permitirVacio: true, mensaje: `Objetivo inválido. Usa: ${OBJETIVOS.join(', ')}.` })),
}, { alMenosUno: 'No hay cambios para guardar.' });

export const idFoto = esquema({ id: objectId() }, { estado: 404, mensaje: 'Foto no encontrada.' });

// ---------- catálogo ----------
export const filtroRutinas = esquema({
  objetivo: opcional(unoDe(OBJETIVOS)),
}, { mensaje: `Objetivo inválido. Usa: ${OBJETIVOS.join(', ')}.` });

export const idRutina = esquema({ id: slug() }, { estado: 404, mensaje: 'Rutina no encontrada.' });
export const idEntrenador = esquema({ id: slug() }, { estado: 404, mensaje: 'Entrenador no encontrado.' });
export const fechaDisponibilidad = esquema({ fecha: fechaDia() }, { mensaje: 'Indica la fecha como AAAA-MM-DD.' });

// ---------- membresía ----------
export const compraMembresia = esquema({
  planId: slug(),
  meses: unoDe(MESES_VALIDOS),
}, { mensaje: `Elige un plan y una duración de ${MESES_VALIDOS.join(', ')} meses.` });

export const renovacion = esquema({
  renovacionAutomatica: booleano(),
}, { mensaje: 'renovacionAutomatica debe ser true o false.' });

// ---------- reservas ----------
export const nuevaReserva = esquema({
  entrenadorId: slug(),
  inicio: instante(),
}, { mensaje: 'Elige un entrenador y un horario.' });

export const idReserva = esquema({ id: objectId() }, { estado: 404, mensaje: 'No hay una cita futura con ese identificador.' });

// ---------- tienda ----------
export const carrito = esquema({
  items: lista(objeto({ productoId: slug(), cantidad: entero({ min: 1, max: 20 }) }), { max: 30 }),
}, { mensaje: 'Cada producto necesita un identificador y una cantidad de 1 a 20.' });
