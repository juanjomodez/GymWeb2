// Archivos del usuario (persistencia dual: ficheros en disco o GridFS + metadatos en la colección `archivos`).
// Solo el dueño puede abrirlos: a cualquier otro usuario se le responde 404, como si no existieran.
import { ErrorHttp } from '../middlewares/errores.js';

// Content-Disposition con nombre ASCII de respaldo y nombre UTF-8 completo (RFC 6266 / RFC 8187).
function nombreDescarga(titulo) {
  const ascii = titulo.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'archivo';
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(titulo)}`;
}

export function crearArchivosControlador(servicios) {
  return {
    async listar(request, response) {
      const { modulo } = request.valido.query;
      response.set('Cache-Control', 'no-store').json({ archivos: await servicios.listarArchivos(request.user.id, { modulo }) });
    },
    // ?descargar=1 lo entrega como adjunto; sin él, el navegador lo muestra (visor de PDF o imagen).
    async ver(request, response) {
      const resultado = await servicios.abrirArchivo(request.user.id, request.valido.params.id);
      if (!resultado) throw new ErrorHttp(404, 'Archivo no encontrado.');
      const { archivo, contenido } = resultado;
      const descargar = Boolean(request.valido.query.descargar);
      response.set({
        'Content-Type': archivo.tipo,
        'Content-Length': String(contenido.length),
        'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; ${nombreDescarga(archivo.titulo)}`,
        'Cache-Control': 'private, no-cache',
        // La huella SHA-256 viaja con la respuesta: el cliente puede comprobar que recibió el archivo íntegro.
        ETag: `"${archivo.sha256}"`,
        'Repr-Digest': `sha-256=:${Buffer.from(archivo.sha256, 'hex').toString('base64')}:`,
      });
      // El visor de PDF del navegador necesita poder ejecutarse; las imágenes se sirven sin permitir nada más.
      if (archivo.tipo !== 'application/pdf') response.set('Content-Security-Policy', "default-src 'none'");
      if (request.fresh) return response.status(304).end();
      response.end(contenido);
    },
  };
}
