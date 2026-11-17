import { GridFSBucket, ObjectId } from 'mongodb';
import { comoId } from './ids.js';

// Adaptador de fotos.files. El driver gestiona los fragmentos de fotos.chunks.
export function crearFotosRepositorio(db) {
  return {
    async subir(usuario, { buffer, tipo }) {
      const bucket = new GridFSBucket(await db(), { bucketName: 'fotos' });
      const usuarioId = comoId(usuario);
      const archivoId = new ObjectId();
      await new Promise((resolve, reject) => {
        bucket.openUploadStreamWithId(archivoId, `perfil-${usuarioId}`, { contentType: tipo, metadata: { usuarioId, tipo } })
          .on('finish', resolve).on('error', reject).end(buffer);
      });
      return archivoId;
    },
    async eliminar(id) {
      await new GridFSBucket(await db(), { bucketName: 'fotos' }).delete(comoId(id));
    },
    async abrir(id) {
      const archivoId = comoId(id);
      if (!archivoId) return null;
      const bucket = new GridFSBucket(await db(), { bucketName: 'fotos' });
      const archivo = await bucket.find({ _id: archivoId }).next();
      if (!archivo) return null;
      return { tipo: archivo.contentType ?? archivo.metadata?.tipo, tamano: archivo.length, stream: bucket.openDownloadStream(archivoId) };
    },
  };
}
