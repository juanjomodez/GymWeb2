// Los middlewares HTTP convierten estos errores de negocio en su código de respuesta.
export class ErrorNegocio extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
