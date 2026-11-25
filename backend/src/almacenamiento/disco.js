// Ficheros en disco (persistencia dual: los bytes viven aquí y sus metadatos en la colección `archivos`).
//
// - Cada fichero se guarda con un nombre UUID v4, nunca con un nombre que venga del usuario.
// - La escritura es atómica: primero un temporal y luego `rename`, así nunca queda un fichero a medias.
// - Las rutas que se guardan en MongoDB son relativas a la raíz; al leerlas se comprueba que no salgan de ella.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

export function crearDisco(raiz) {
  const base = path.resolve(raiz);

  // Ruta relativa guardada en la base de datos → ruta absoluta dentro de la raíz (o error si intenta salir).
  function resolver(ruta) {
    const absoluta = path.resolve(base, ruta);
    if (typeof ruta !== 'string' || path.isAbsolute(ruta) || !absoluta.startsWith(base + path.sep)) {
      throw new Error('Ruta de almacenamiento inválida.');
    }
    return absoluta;
  }

  return {
    raiz: base,
    // Guarda `buffer` en <raiz>/<carpeta>/<uuid>.<extension> y devuelve sus datos para la colección `archivos`.
    async guardar(carpeta, extension, buffer) {
      const nombre = `${randomUUID()}.${extension}`;
      const ruta = path.posix.join(carpeta, nombre);
      await this.escribir(ruta, buffer);
      return { nombre, ruta, peso: buffer.length, sha256: sha256(buffer) };
    },
    // Escribe (o reescribe) un fichero en una ruta ya conocida, de forma atómica.
    async escribir(ruta, buffer) {
      const destino = resolver(ruta);
      await mkdir(path.dirname(destino), { recursive: true });
      const temporal = `${destino}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporal, buffer, { flag: 'wx' });
        await rename(temporal, destino);
      } catch (error) {
        await rm(temporal, { force: true });
        throw error;
      }
    },
    // Devuelve el contenido o null si el fichero ya no existe (p. ej. tras un redespliegue con disco efímero).
    async leer(ruta) {
      try {
        return await readFile(resolver(ruta));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async eliminar(ruta) {
      await rm(resolver(ruta), { force: true });
    },
  };
}
