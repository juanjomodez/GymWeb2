// Errores de reglas de negocio: la API los convierte en respuestas con su estado HTTP y su mensaje.
export class ErrorNegocio extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
