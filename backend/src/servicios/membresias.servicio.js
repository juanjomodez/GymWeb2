import { ErrorNegocio } from './errores.js';
import { crearReferencia } from './referencias.js';

export const MESES_VALIDOS = [1, 3, 6, 12];

export function sumarMeses(fecha, meses) {
  const resultado = new Date(fecha);
  const dia = resultado.getUTCDate();
  resultado.setUTCDate(1);
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0)).getUTCDate();
  resultado.setUTCDate(Math.min(dia, ultimo));
  return resultado;
}

// `comprobantes`: Map referencia del pago → URL de su comprobante PDF (si ya existe).
function publicaMembresia(membresia, comprobantes = new Map()) {
  if (!membresia) return null;
  const { _id, usuarioId, pagos, ...resto } = membresia;
  return {
    id: _id.toString(), ...resto,
    pagos: pagos.map(({ referencia, monto, fecha, tipo }) => ({ referencia, monto, fecha, tipo, comprobante: comprobantes.get(referencia) ?? null })),
  };
}

export function crearMembresiasServicio({ membresias, planes }, transaccion, archivos) {
  // Genera los comprobantes que falten de esas membresías y devuelve sus URLs por referencia de pago.
  async function comprobantes(usuario, lista) {
    await archivos.comprobantesMembresias(usuario, lista);
    return archivos.urlsPorOperacion('membresias', lista.flatMap(m => m.pagos.map(p => p.referencia)));
  }

  async function sincronizar(usuario, session) {
    const ahora = new Date();
    const membresia = await membresias.buscarVencida(usuario, ahora, session);
    if (!membresia) return;
    if (!membresia.renovacionAutomatica) {
      await membresias.actualizarVencida(membresia._id, membresia.fechaFin, { $set: { estado: 'vencida', updatedAt: ahora } }, session);
      return;
    }
    let fin = membresia.fechaFin;
    const pagos = [];
    while (fin <= ahora && pagos.length < 24) {
      fin = sumarMeses(fin, membresia.meses);
      pagos.push({ referencia: crearReferencia(), monto: membresia.plan.precioMensual * membresia.meses, fecha: ahora, tipo: 'renovacion' });
    }
    await membresias.actualizarVencida(membresia._id, membresia.fechaFin, {
      $set: { fechaFin: fin, updatedAt: ahora },
      $push: { pagos: { $each: pagos } },
      $inc: { precioPagado: pagos.reduce((suma, pago) => suma + pago.monto, 0) },
    }, session);
  }

  return {
    sincronizar,
    async obtenerMembresia(usuario) {
      await sincronizar(usuario);
      const historial = await membresias.historial(usuario, 20);
      // Incluye renovaciones automáticas recién aplicadas y compras anteriores a los comprobantes.
      const urls = await comprobantes(usuario, historial);
      return { actual: publicaMembresia(historial.find(m => m.estado === 'activa'), urls), historial: historial.map(m => publicaMembresia(m, urls)) };
    },
    async comprarMembresia(usuario, planId, meses) {
      const membresia = await transaccion(async (_base, session) => {
        const plan = await planes.buscarActivo(planId, session);
        if (!plan) throw new ErrorNegocio(404, 'Ese plan no está disponible.');
        await sincronizar(usuario, session);
        const ahora = new Date();
        const monto = plan.precioMensual * meses;
        const pago = { referencia: crearReferencia(), monto, fecha: ahora };
        const actual = await membresias.buscarActiva(usuario, session);
        if (actual?.planId === planId) {
          return membresias.actualizar(actual._id, {
            $set: { fechaFin: sumarMeses(actual.fechaFin, meses), updatedAt: ahora },
            $inc: { precioPagado: monto },
            $push: { pagos: { ...pago, tipo: 'extension' } },
          }, session);
        }
        if (actual) await membresias.actualizar(actual._id, { $set: { estado: 'reemplazada', fechaFin: ahora, updatedAt: ahora } }, session);
        return membresias.crear({
          usuarioId: usuario, planId,
          plan: { nombre: plan.nombre, precioMensual: plan.precioMensual, incluyeEntrenador: plan.incluyeEntrenador, maxPersonas: plan.maxPersonas },
          meses, precioPagado: monto, fechaInicio: ahora, fechaFin: sumarMeses(ahora, meses),
          estado: 'activa', renovacionAutomatica: false, pagos: [{ ...pago, tipo: 'compra' }], createdAt: ahora, updatedAt: ahora,
        }, session);
      });
      // El comprobante se genera después de confirmar la transacción (sus reintentos no deben escribir ficheros).
      return publicaMembresia(membresia, await comprobantes(usuario, [membresia]));
    },
    async cambiarRenovacion(usuario, activar) {
      await sincronizar(usuario);
      const membresia = await membresias.actualizarActiva(usuario, { $set: { renovacionAutomatica: activar, updatedAt: new Date() } });
      if (!membresia) throw new ErrorNegocio(404, 'No tienes una membresía activa.');
      return publicaMembresia(membresia, await archivos.urlsPorOperacion('membresias', membresia.pagos.map(p => p.referencia)));
    },
  };
}
