// Valida body, query y params con los esquemas de validaciones/esquemas.js antes del controlador.
// Los datos limpios quedan en request.valido.{body,query,params}; si algo falla responde 400
// (o el estado del esquema) con { message, errores: [{ campo, problema }] }.
export function validar({ params, query, body } = {}) {
  return (request, _response, next) => {
    try {
      request.valido = {
        // El orden importa: un identificador imposible en la URL es 404 antes que un cuerpo invalido.
        params: params ? params(request.params) : request.params,
        query: query ? query(request.query) : {},
        body: body ? body(request.body) : undefined,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}