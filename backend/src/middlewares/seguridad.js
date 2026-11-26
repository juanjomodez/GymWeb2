// Cabeceras de seguridad, CORS y comprobación de origen para las escrituras de la API.

export function cabecerasSeguridad(request, response, next) {
  response.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (request.secure) response.set('Strict-Transport-Security', 'max-age=15552000');
  next();
}

const mismoOrigen = request => `${request.protocol}://${request.get('host')}`;

// CORS: la web y la API se sirven desde el mismo origen, asi que por defecto no se abre a nadie.
// Los origenes de CORS_ORIGINS (por ejemplo un frontend en otro dominio) pueden llamar
// a la API con cookies; el resto no recibe cabeceras CORS y el navegador bloquea la respuesta.
export function cors(origenesPermitidos = []) {
  const permitidos = new Set(origenesPermitidos);
  return (request, response, next) => {
    const origen = request.headers.origin;
    response.vary('Origin');
    if (!origen || !permitidos.has(origen)) return next();
    response.set({
      'Access-Control-Allow-Origin': origen,
      'Access-Control-Allow-Credentials': 'true',
    });
    if (request.method !== 'OPTIONS') return next();
    // Preflight: el navegador pregunta antes de enviar JSON, PATCH, PUT o DELETE.
    response.set({
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    });
    response.status(204).end();
  };
}

// Proteccion CSRF basica: si una escritura trae cabecera Origin, debe ser el mismo sitio
// o uno de los origenes permitidos por CORS.
export function verificarOrigen(origenesPermitidos = []) {
  const permitidos = new Set(origenesPermitidos);
  return (request, response, next) => {
    const origen = request.headers.origin;
    if (['GET', 'HEAD'].includes(request.method) || !origen) return next();
    if (origen === mismoOrigen(request) || permitidos.has(origen)) return next();
    response.status(403).json({ message: 'Origen no permitido.' });
  };
}

// Las respuestas de la API son personales por defecto: el navegador no debe guardarlas.
export function sinCache(_request, response, next) {
  response.set('Cache-Control', 'no-store');
  next();
}