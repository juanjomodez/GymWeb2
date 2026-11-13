// Validador de payloads sin dependencias. Cada regla recibe el valor y devuelve el valor limpio
// (recortado, en minúsculas...) o lanza FalloCampo. `esquema()` aplica las reglas a un objeto,
// y descarta los campos que no están en el esquema y reúne todos los errores en un ErrorHttp 400
import { ErrorHttp } from '../middlewares/errores.js';

export class FalloCampo extends Error {
  constructor(problema, mensaje) {
    super(problema);
    this.mensaje = mensaje;
  }
}

const CONTROL = /[\u0000-\u001f\u007f]/;

// Marca una regla como no obligatoria: si el campo no viene, simplemente no aparece en el resultado
export const opcional = regla => Object.assign((valor, campo) => regla(valor, campo), { opcional: true });

export const texto = ({ min = 1, max = 200, patron, minusculas = false, permitirVacio = false, mensaje } = {}) => valor => {
  if (typeof valor !== 'string') throw new FalloCampo('debe ser texto', mensaje);
  let limpio = valor.trim();
  if (minusculas) limpio = limpio.toLowerCase();
  if (limpio === '' && permitirVacio) return '';
  if (limpio.length < min || limpio.length > max) throw new FalloCampo(`debe tener entre ${min} y ${max} caracteres`, mensaje);
  if (CONTROL.test(limpio)) throw new FalloCampo('contiene caracteres no permitidos', mensaje);
  if (patron && !patron.test(limpio)) throw new FalloCampo('no tiene un formato válido', mensaje);
  return limpio;
};

export const correo = ({ mensaje } = {}) => valor => {
  if (typeof valor !== 'string' || valor.length > 254) throw new FalloCampo('debe ser un correo de hasta 254 caracteres', mensaje);
  const limpio = valor.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) throw new FalloCampo('no es un correo válido', mensaje);
  return limpio;
};

// La contraseña no se recorta: los espacios forman parte de ella
export const contrasena = ({ mensaje } = {}) => valor => {
  if (typeof valor !== 'string' || valor.length < 8 || valor.length > 128) throw new FalloCampo('debe tener entre 8 y 128 caracteres', mensaje);
  return valor;
};

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slug = ({ mensaje } = {}) => valor => {
  if (typeof valor !== 'string' || valor.length > 60 || !SLUG.test(valor)) throw new FalloCampo('debe ser un identificador válido', mensaje);
  return valor;
};

// Identificador de MongoDB (ObjectId) en texto: 24 caracteres hexadecimales en minusculas.
export const objectId = ({ mensaje } = {}) => valor => {
  if (typeof valor !== 'string' || !/^[a-f0-9]{24}$/.test(valor)) throw new FalloCampo('debe ser un identificador válido', mensaje);
  return valor;
};

export const unoDe = (valores, { permitirVacio = false, mensaje } = {}) => valor => {
  if (permitirVacio && valor === '') return '';
  if (!valores.includes(valor)) throw new FalloCampo(`debe ser uno de: ${valores.join(', ')}`, mensaje);
  return valor;
};

export const booleano = ({ mensaje } = {}) => valor => {
  if (typeof valor !== 'boolean') throw new FalloCampo('debe ser true o false', mensaje);
  return valor;
};

export const entero = ({ min = -Infinity, max = Infinity, mensaje } = {}) => valor => {
  if (!Number.isInteger(valor) || valor < min || valor > max) throw new FalloCampo(`debe ser un entero entre ${min} y ${max}`, mensaje);
  return valor;
};

// Día del calendario AAAA-MM-DD que exista de verdad (rechaza 2026-02-31).
export const fechaDia = ({ mensaje } = {}) => valor => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new FalloCampo('debe tener el formato AAAA-MM-DD', mensaje);
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) throw new FalloCampo('no es una fecha real', mensaje);
  return valor;
};

// Instante en formato ISO 8601; se devuelve como Date.
export const instante = ({ mensaje } = {}) => valor => {
  const fecha = typeof valor === 'string' && valor.length <= 40 ? new Date(valor) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) throw new FalloCampo('debe ser una fecha y hora ISO 8601', mensaje);
  return fecha;
};

export const lista = (regla, { min = 0, max = 50, mensaje } = {}) => valor => {
  if (!Array.isArray(valor) || valor.length < min || valor.length > max) throw new FalloCampo(`debe ser una lista de ${min} a ${max} elementos`, mensaje);
  return valor.map((item, i) => {
    try { return regla(item); } catch (error) {
      if (error instanceof FalloCampo) throw new FalloCampo(`elemento ${i + 1}: ${error.message}`, error.mensaje ?? mensaje);
      throw error;
    }
  });
};

// Objeto anidado (por ejemplo cada producto del carrito) entonces decarta los cambios
export const objeto = (forma, { mensaje } = {}) => valor => {
  const { limpio, errores } = aplicar(forma, valor);
  if (errores.length) throw new FalloCampo(errores.map(e => `${e.campo} ${e.problema}`).join('; '), errores[0].mensaje ?? mensaje);
  return limpio;
};

function aplicar(forma, entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { limpio: {}, errores: [{ campo: '(cuerpo)', problema: 'debe ser un objeto JSON' }] };
  }
  const limpio = {};
  const errores = [];
  for (const [campo, regla] of Object.entries(forma)) {
    const valor = entrada[campo];
    if (valor === undefined) {
      if (!regla.opcional) errores.push({ campo, problema: 'es obligatorio' });
      continue;
    }
    try {
      limpio[campo] = regla(valor, campo);
    } catch (error) {
      if (!(error instanceof FalloCampo)) throw error;
      errores.push({ campo, problema: error.message, mensaje: error.mensaje });
    }
  }
  return { limpio, errores };
}

// Crea un validador de objeto completo.
//   mensaje: texto general del 400 (se usa si la regla que fallo no tiene uno propio)
//   estado: codigo a devolver (404 para identificadores en la URL que no pueden existir)
//   alMenosUno: mensaje si todos los campos son opcionales y no llegó ninguno
export function esquema(forma, { mensaje = 'Revisa los datos enviados.', estado = 400, alMenosUno } = {}) {
  return entrada => {
    const { limpio, errores } = aplicar(forma, entrada);
    if (!errores.length && alMenosUno && !Object.keys(limpio).length) throw new ErrorHttp(estado, alMenosUno);
    if (errores.length) {
      throw new ErrorHttp(estado, errores.find(e => e.mensaje)?.mensaje ?? mensaje, errores.map(({ campo, problema }) => ({ campo, problema })));
    }
    return limpio;
  };
}