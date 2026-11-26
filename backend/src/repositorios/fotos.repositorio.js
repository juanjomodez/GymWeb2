import { GridFSBucket, ObjectId } from 'mongodb';
import { comoId } from './ids.js';

// Adaptador de fotos.files. El driver gestiona los fragmentos de fotos.chunks.
// Cada foto se guarda con nombre UUID (nunca el del navegador) y su SHA-256 en los metadatos.
export function crearFotosRepositorio(db) {
  const bucket = async () => new GridFSBucket(await db(), { bucketName: 'fotos' });
  return {
    async subir(usuario, { buffer, tipo, nombre, sha256 }) {
      const usuarioId = comoId(usuario);
      const archivoId = new ObjectId();
      const fotos = await bucket();
      await new Promise((resolve, reject) => {
        fotos.openUploadStreamWithId(archivoId, nombre, { contentType: tipo, metadata: { usuarioId, tipo, sha256 } })
          .on('finish', resolve).on('error', reject).end(buffer);
      });
      return archivoId;
    },
    async eliminar(id) {
      await (await bucket()).delete(comoId(id));
    },
    async abrir(id) {
      const archivoId = comoId(id);
      if (!archivoId) return null;
      const fotos = await bucket();
      const archivo = await fotos.find({ _id: archivoId }).next();
      if (!archivo) return null;
      return {
        tipo: archivo.contentType ?? archivo.metadata?.tipo, tamano: archivo.length, sha256: archivo.metadata?.sha256 ?? null,
        stream: fotos.openDownloadStream(archivoId),
      };
    },
    // Contenido completo (las fotos pesan como máximo 2 MiB) o null si ya no existe.
    async leer(id) {
      const foto = await this.abrir(id);
      if (!foto) return null;
      const partes = [];
      for await (const parte of foto.stream) partes.push(parte);
      return Buffer.concat(partes);
    },
  };
}
