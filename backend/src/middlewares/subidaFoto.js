// Recibe la foto de perfil (multipart/form-data, campo `foto`) en memoria y comprueba su tipo real.
// Deja en request.foto = { buffer, tipo }. Nunca escribe en el disco del servidor.
import multer from 'multer';
import { MAX_FOTO, TIPOS_FOTO } from '../esquema.js';
import { ErrorHttp } from './errores.js';

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FOTO, files: 1, fields: 0, parts: 1 },
}).single('foto');

// Tipo segun los primeros bytes (no se confia en el nombre ni en el tipo que declara el navegador).
export function tipoImagen(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function subidaFoto(request, response, next) {
  multipart(request, response, error => {
    if (error?.code === 'LIMIT_FILE_SIZE') return next(new ErrorHttp(413, 'La foto no puede pesar más de 2 MB.'));
    if (error instanceof multer.MulterError) return next(new ErrorHttp(400, 'Envía una sola imagen en el campo "foto".'));
    if (error) return next(new ErrorHttp(400, 'No se pudo leer el archivo enviado.'));
    if (!request.file) return next(new ErrorHttp(400, 'Selecciona una imagen en el campo "foto".'));
    const tipo = tipoImagen(request.file.buffer);
    if (!tipo || !TIPOS_FOTO.includes(tipo)) return next(new ErrorHttp(415, 'Formato no permitido. Usa JPG, PNG o WebP.'));
    request.foto = { buffer: request.file.buffer, tipo };
    next();
  });
}