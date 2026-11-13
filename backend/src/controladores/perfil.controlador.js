// Perfil del usuario y foto de perfil (subida multipart → GridFS, ver middlewares/subidaFoto.js).
import { pipeline } from 'node:stream/promises';
import { ErrorHttp } from '../middlewares/errores.js';

export function crearPerfilControlador(servicios) {
  return {
    async ver(request, response) {
      response.json({ perfil: await servicios.obtenerPerfil(request.user.id) });
    },
    async actualizar(request, response) {
      response.json({ message: 'Perfil actualizado.', perfil: await servicios.actualizarPerfil(request.user.id, request.valido.body) });
    },
    // request.foto la deja lista subidaFoto (bytes ya verificados).
    async subirFoto(request, response) {
      const perfil = await servicios.guardarFotoPerfil(request.user.id, request.foto);
      response.status(201).json({ message: 'Foto de perfil actualizada.', perfil });
    },
    async eliminarFoto(request, response) {
      await servicios.eliminarFotoPerfil(request.user.id);
      response.json({ message: 'Foto de perfil eliminada.' });
    },
    // Cada subida crea un archivo con id nuevo: el navegador puede guardarlo en cache sin límite.
    async descargarFoto(request, response) {
      const foto = await servicios.abrirFoto(request.valido.params.id);
      if (!foto) throw new ErrorHttp(404, 'Foto no encontrada.');
      response.set({
        'Content-Type': foto.tipo,
        'Content-Length': String(foto.tamano),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'",
      });
      // Si falla a mitad de envio ya no se puede responder con JSON: se corta la conexion
      await pipeline(foto.stream, response).catch(() => response.destroy());
    },
  };
}