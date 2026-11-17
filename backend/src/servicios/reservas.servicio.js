import { ErrorNegocio } from './errores.js';
import { comoId } from '../repositorios/ids.js';

// Los horarios semanales del gimnasio se interpretan en Cali/Bogotá (UTC−5).
const HORA = 60 * 60 * 1000;
const DESFASE_CALI = 5 * HORA;
const DIAS_RESERVA = 30;
const MAX_RESERVAS_FUTURAS = 4;
const instante = (fecha, hora) => new Date(`${fecha}T${hora}:00-05:00`);
const diaIso = fecha => new Date(`${fecha}T12:00:00-05:00`).getUTCDay() || 7;
const local = fecha => new Date(fecha.getTime() - DESFASE_CALI);
const fechaLocal = fecha => local(fecha).toISOString().slice(0, 10);
const horaLocal = fecha => local(fecha).toISOString().slice(11, 16);

export function crearReservasServicio({ entrenadores, reservas, membresias }, sincronizarMembresia) {
  return {
    async disponibilidad(entrenadorId, fecha) {
      const entrenador = await entrenadores.buscarActivo(entrenadorId);
      if (!entrenador) throw new ErrorNegocio(404, 'Entrenador no encontrado.');
      const ahora = Date.now();
      const horas = entrenador.horario.find(h => h.dia === diaIso(fecha))?.horas ?? [];
      const inicios = horas.map(h => instante(fecha, h)).filter(inicio => inicio.getTime() > ahora && inicio.getTime() < ahora + DIAS_RESERVA * 24 * HORA);
      const ocupadas = new Set((await reservas.buscarOcupadas(entrenadorId, inicios)).map(reserva => reserva.inicio.getTime()));
      return inicios.map(inicio => ({ hora: horaLocal(inicio), inicio: inicio.toISOString(), disponible: !ocupadas.has(inicio.getTime()) }));
    },
    async crearReserva(usuario, entrenadorId, inicio) {
      const ahora = Date.now();
      if (inicio.getTime() % HORA !== 0 || inicio.getTime() <= ahora || inicio.getTime() > ahora + DIAS_RESERVA * 24 * HORA) {
        throw new ErrorNegocio(400, `Elige un horario de los próximos ${DIAS_RESERVA} días.`);
      }
      const entrenador = await entrenadores.buscarActivo(entrenadorId);
      if (!entrenador) throw new ErrorNegocio(404, 'Entrenador no encontrado.');
      if (!entrenador.horario.find(h => h.dia === diaIso(fechaLocal(inicio)))?.horas.includes(horaLocal(inicio))) {
        throw new ErrorNegocio(400, 'El entrenador no atiende en ese horario.');
      }
      await sincronizarMembresia(usuario);
      const membresia = await membresias.buscarActiva(usuario);
      if (!membresia?.plan.incluyeEntrenador) throw new ErrorNegocio(403, 'Las citas con entrenadores requieren un Plan Premium activo.');
      if (await reservas.contarFuturas(usuario, new Date()) >= MAX_RESERVAS_FUTURAS) {
        throw new ErrorNegocio(409, `Puedes tener hasta ${MAX_RESERVAS_FUTURAS} citas pendientes.`);
      }
      const reserva = { usuarioId: usuario, entrenadorId, inicio, fin: new Date(inicio.getTime() + HORA), estado: 'confirmada', createdAt: new Date() };
      try {
        const id = await reservas.crear(reserva);
        return { id: id.toString(), entrenadorId, entrenador: entrenador.nombre, inicio, fin: reserva.fin, estado: reserva.estado };
      } catch (error) {
        if (error.code !== 11000) throw error;
        throw new ErrorNegocio(409, error.keyPattern?.usuarioId ? 'Ya tienes otra cita a esa hora.' : 'Ese horario acaba de ser reservado. Elige otro.');
      }
    },
    listarReservas: usuario => reservas.listar(usuario, 50),
    async cancelarReserva(usuario, id) {
      if (!comoId(id)) throw new ErrorNegocio(404, 'Reserva no encontrada.');
      const resultado = await reservas.cancelarFutura(usuario, id, new Date());
      if (!resultado.matchedCount) throw new ErrorNegocio(404, 'No hay una cita futura con ese identificador.');
    },
  };
}
