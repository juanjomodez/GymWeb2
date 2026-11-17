import { ErrorNegocio } from './errores.js';

const PROYECCION_PERFIL = { nombre: 1, correo: 1, telefono: 1, objetivo: 1, foto: 1 };
const publicoPerfil = usuario => usuario ? {
  id: usuario._id.toString(), nombre: usuario.nombre, correo: usuario.correo,
  telefono: usuario.telefono ?? '', objetivo: usuario.objetivo ?? '', fotoUrl: usuario.foto?.url ?? null,
} : null;

export function crearUsuariosServicio({ usuarios, sesiones, fotos }) {
  const obtenerPerfil = async usuario => publicoPerfil(await usuarios.buscarPorId(usuario, PROYECCION_PERFIL));

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
    async guardarFotoPerfil(usuario, { buffer, tipo }) {
      const archivoId = await fotos.subir(usuario, { buffer, tipo });
      const foto = { archivoId, url: `/api/fotos/${archivoId}`, tipo, tamano: buffer.length, subidaAt: new Date() };
      let anterior;
      try {
        anterior = await usuarios.actualizar(usuario, { $set: { foto, updatedAt: foto.subidaAt } }, { projection: { foto: 1 }, returnDocument: 'before' });
      } catch (error) {
        await fotos.eliminar(archivoId).catch(() => {});
        throw error;
      }
      if (!anterior) {
        await fotos.eliminar(archivoId).catch(() => {});
        throw new ErrorNegocio(404, 'Usuario no encontrado.');
      }
      if (anterior.foto?.archivoId) await fotos.eliminar(anterior.foto.archivoId).catch(() => {});
      return obtenerPerfil(usuario);
    },
    async eliminarFotoPerfil(usuario) {
      const anterior = await usuarios.actualizar(usuario, { $unset: { foto: '' }, $set: { updatedAt: new Date() } }, { projection: { foto: 1 }, returnDocument: 'before' });
      if (anterior?.foto?.archivoId) await fotos.eliminar(anterior.foto.archivoId).catch(() => {});
    },
    abrirFoto: id => fotos.abrir(id),
  };
}
