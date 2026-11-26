import { randomUUID } from 'node:crypto';
import { sha256 } from '../almacenamiento/disco.js';
import { EXTENSION_FOTO } from '../esquema.js';
import { ErrorNegocio } from './errores.js';

const PROYECCION_PERFIL = { nombre: 1, correo: 1, telefono: 1, objetivo: 1, foto: 1 };
const publicoPerfil = usuario => usuario ? {
  id: usuario._id.toString(), nombre: usuario.nombre, correo: usuario.correo,
  telefono: usuario.telefono ?? '', objetivo: usuario.objetivo ?? '', fotoUrl: usuario.foto?.url ?? null,
} : null;

export function crearUsuariosServicio({ usuarios, sesiones, fotos }, archivos) {
  const obtenerPerfil = async usuario => publicoPerfil(await usuarios.buscarPorId(usuario, PROYECCION_PERFIL));
  // Borra el contenido de GridFS y su registro en `archivos`. Ninguno de los dos fallos debe romper la petición.
  async function borrarFoto(archivoId) {
    await fotos.eliminar(archivoId).catch(() => {});
    await archivos.olvidarFoto(archivoId).catch(() => {});
  }

  return {
    findUserByEmail: correo => usuarios.buscarPorCorreo(correo),
    async createUser(usuario) {
      const id = await usuarios.crear({ rol: 'cliente', ...usuario });
      return { id: id.toString(), nombre: usuario.nombre, correo: usuario.correo };
    },
    createSession: sesion => sesiones.crear(sesion),
    async findSessionUser(tokenHash) {
      const sesion = await sesiones.buscarVigente(tokenHash, new Date());
      if (!sesion) return null;
      const usuario = await usuarios.buscarPorId(sesion.userId, { nombre: 1, correo: 1, rol: 1, 'foto.url': 1 });
      return usuario ? {
        id: usuario._id.toString(), nombre: usuario.nombre, correo: usuario.correo,
        rol: usuario.rol ?? 'cliente', fotoUrl: usuario.foto?.url ?? null,
      } : null;
    },
    deleteSession: tokenHash => sesiones.eliminar(tokenHash),
    obtenerPerfil,
    async actualizarPerfil(usuario, cambios) {
      const $set = { updatedAt: new Date() };
      const $unset = {};
      for (const [campo, valor] of Object.entries(cambios)) {
        if (valor === '') $unset[campo] = '';
        else $set[campo] = valor;
      }
      return publicoPerfil(await usuarios.actualizar(
        usuario, { $set, ...(Object.keys($unset).length ? { $unset } : {}) }, { projection: PROYECCION_PERFIL },
      ));
    },
    // Guarda la imagen en GridFS con nombre UUID y su SHA-256, registra sus metadatos en `archivos` y la
    // enlaza en el usuario. Si algo falla se deshace lo hecho; al final borra la foto anterior y su registro.
    async guardarFotoPerfil(usuario, { buffer, tipo }) {
      const nombre = `${randomUUID()}.${EXTENSION_FOTO[tipo]}`;
      const huella = sha256(buffer);
      const subidaAt = new Date();
      const archivoId = await fotos.subir(usuario, { buffer, tipo, nombre, sha256: huella });
      const deshacer = async () => {
        await archivos.olvidarFoto(archivoId).catch(() => {});
        await fotos.eliminar(archivoId).catch(() => {});
      };
      const foto = { archivoId, url: `/api/fotos/${archivoId}`, tipo, tamano: buffer.length, nombre, sha256: huella, subidaAt };
      let anterior;
      try {
        await archivos.registrarFoto({ autor: usuario, archivoId, nombre, tipo, peso: buffer.length, sha256: huella, fecha: subidaAt });
        anterior = await usuarios.actualizar(usuario, { $set: { foto, updatedAt: subidaAt } }, { projection: { foto: 1 }, returnDocument: 'before' });
      } catch (error) {
        await deshacer();
        throw error;
      }
      if (!anterior) {
        await deshacer();
        throw new ErrorNegocio(404, 'Usuario no encontrado.');
      }
      if (anterior.foto?.archivoId) await borrarFoto(anterior.foto.archivoId);
      return obtenerPerfil(usuario);
    },
    async eliminarFotoPerfil(usuario) {
      const anterior = await usuarios.actualizar(usuario, { $unset: { foto: '' }, $set: { updatedAt: new Date() } }, { projection: { foto: 1 }, returnDocument: 'before' });
      if (anterior?.foto?.archivoId) await borrarFoto(anterior.foto.archivoId);
    },
    abrirFoto: id => fotos.abrir(id),
  };
}
