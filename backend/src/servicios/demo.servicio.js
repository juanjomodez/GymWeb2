import { hashPassword, verifyPassword } from '../registration.js';
import { crearUsuariosRepositorio } from '../repositorios/usuarios.repositorio.js';
import { comoId } from '../repositorios/ids.js';
import { crearServicios } from './index.js';
import { ErrorNegocio } from './errores.js';

// Identidad reservada para los datos de demostración; nunca se adopta una cuenta ajena.
export const DEMO = Object.freeze({
  id: '676c6f7764656d6f00000001',
  nombre: 'Cuenta Demo GymFlow',
  correo: 'demo@gymflow.test',
  password: 'GymFlowDemo2026!',
});

async function reservarCita(servicios, usuario) {
  const reservas = await servicios.listarReservas(usuario);
  const pendiente = reservas.find(reserva => reserva.estado === 'confirmada' && new Date(reserva.inicio) > new Date());
  if (pendiente) return pendiente;

  const entrenadores = await servicios.listarEntrenadores();
  for (let dia = 1; dia < 30; dia++) {
    const fecha = new Date(Date.now() - 5 * 3600000 + dia * 86400000).toISOString().slice(0, 10);
    for (const entrenador of entrenadores) {
      const horarios = await servicios.disponibilidad(entrenador._id, fecha);
      const horario = horarios.find(h => h.disponible);
      if (horario) return servicios.crearReserva(usuario, entrenador._id, new Date(horario.inicio));
    }
  }
  throw new ErrorNegocio(409, 'No hay horarios libres para crear la cita demo.');
}

async function comprarProducto(servicios, usuario) {
  const pedidos = await servicios.listarPedidos(usuario);
  const existente = pedidos.find(pedido => ['pagado', 'entregado'].includes(pedido.estado));
  if (existente) return existente;

  const productos = await servicios.listarProductos();
  const producto = productos.find(p => p._id === 'shaker' && p.stock > 0) ?? productos.find(p => p.stock > 0);
  if (!producto) throw new ErrorNegocio(409, 'No hay productos con stock para crear la compra demo.');
  await servicios.guardarCarrito(usuario, [{ productoId: producto._id, cantidad: 1 }]);
  return servicios.crearPedido(usuario);
}

export async function sembrarDemo(conexion) {
  // El trabajo criptográfico de la nueva contraseña queda fuera de la transacción.
  const passwordHash = await hashPassword(DEMO.password);
  for (let intento = 0; intento < 3; intento++) {
    try {
      return await conexion.transaccion(async (base, session) => {
        // Los servicios reutilizan la transacción actual, sin iniciar transacciones anidadas.
        const contexto = {
          ...conexion,
          db: async () => base,
          transaccion: accion => accion(base, session),
        };
        const servicios = crearServicios(contexto, { session });
        const usuarios = crearUsuariosRepositorio(contexto.db, session);
        const porCorreo = await usuarios.buscarPorCorreo(DEMO.correo);
        const porId = await usuarios.buscarPorId(DEMO.id);
        if ((porCorreo && porCorreo._id.toString() !== DEMO.id) || (porId && porId.correo !== DEMO.correo)) {
          throw new ErrorNegocio(409, 'La identidad demo ya pertenece a otra cuenta. No se reemplazó ese usuario.');
        }
        if (porCorreo) {
          if (porCorreo.rol !== 'cliente' || !await verifyPassword(DEMO.password, porCorreo.passwordHash)) {
            throw new ErrorNegocio(409, 'La cuenta demo tiene un rol o contraseña diferente. Se conservaron sus credenciales.');
          }
          // Esta escritura serializa dos seeds simultáneos sobre la misma cuenta demo.
          await usuarios.actualizar(DEMO.id, { $set: { updatedAt: new Date() } });
        } else {
          await servicios.createUser({
            _id: comoId(DEMO.id), nombre: DEMO.nombre, correo: DEMO.correo,
            passwordHash, createdAt: new Date(),
          });
        }

        const actual = (await servicios.obtenerMembresia(DEMO.id)).actual;
        const membresia = actual?.plan.incluyeEntrenador
          ? actual
          : await servicios.comprarMembresia(DEMO.id, 'premium', 1);
        const reserva = await reservarCita(servicios, DEMO.id);
        const pedido = await comprarProducto(servicios, DEMO.id);
        return {
          usuario: { id: DEMO.id, nombre: porCorreo?.nombre ?? DEMO.nombre, correo: DEMO.correo },
          membresia, reserva, pedido,
        };
      });
    } catch (error) {
      // Dos primeras ejecuciones simultáneas pueden competir por el mismo _id/correo.
      // Tras el rollback se vuelve a leer la cuenta ya creada por la otra ejecución.
      if (error.code === 11000 && intento < 2) continue;
      throw error;
    }
  }
}
