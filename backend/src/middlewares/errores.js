// Manejo centralizado de errores: los controladores lanzan errores y este modulo decide
// el código HTTP y el mensaje. Nunca se envían al cliente detalles internos (driver, URI, pila).

// Error con estado HTTP conocido. `detalles` lista los campos invalidos de una validacion.
export class ErrorHttp extends Error {
  constructor(status, message, detalles) {
    super(message);
    this.name = 'ErrorHttp';
    this.status = status;
    if (detalles?.length) this.detalles = detalles;
  }
}

// Fallos de programacion: responden 500. El resto de fallos inesperados (MongoDB, red) responden 503.
const ERRORES_DE_CODIGO = [TypeError, ReferenceError, SyntaxError, RangeError];

// Envuelve un controlador async: cualquier excepcion llega al manejador central.
// `mensajeFallo` reemplaza el mensaje genérico cuando el error no es de negocio ni de validación.
export const asincrono = (controlador, mensajeFallo) => async (request, response, next) => {
  try {
    await controlador(request, response, next);
  } catch (error) {
    if (mensajeFallo && !Number.isInteger(error?.status)) error.mensajeFallo = mensajeFallo;
    next(error);
  }
};

// Cualquier ruta /api que no exista.
export function rutaNoEncontrada(_request, _response, next) {
  next(new ErrorHttp(404, 'Ruta no encontrada.'));
}

// Último middleware de la aplicación (Express lo reconoce por sus 4 parámetros).
export function manejadorErrores(error, request, response, _next) {
  if (response.headersSent) return response.destroy();
  response.set('Cache-Control', 'no-store');

  // Errores del lector de JSON de Express (body-parser).
  if (error?.type === 'entity.too.large') return response.status(413).json({ message: 'La solicitud es demasiado grande.' });
  if (error?.type === 'entity.parse.failed') return response.status(400).json({ message: 'JSON inválido.' });

  // Errores esperados: validacion (400/404), sesion (401), negocio (403, 404, 409...).
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
    const cuerpo = { message: error.message };
    if (error.detalles) cuerpo.errores = error.detalles;
    return response.status(error.status).json(cuerpo);
  }

  const esDeCodigo = ERRORES_DE_CODIGO.some(tipo => error instanceof tipo);
  console.error(`[error] ${request.method} ${request.originalUrl}: ${error?.name ?? 'Error'}`, esDeCodigo ? error : error?.message);
  if (esDeCodigo) return response.status(500).json({ message: 'Error interno.' });
  response.status(503).json({ message: error?.mensajeFallo ?? 'No se pudo completar la operación. Intenta más tarde.' });
}