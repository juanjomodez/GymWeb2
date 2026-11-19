import { DEMO } from '../src/servicios/demo.servicio.js';

export function mostrarResumenDemo(resultado) {
  console.log('Datos demo listos.');
  console.log(`Correo: ${resultado.usuario.correo}`);
  console.log(`Contraseña de demostración: ${DEMO.password}`);
  console.log(`Membresía: ${resultado.membresia.plan.nombre} (${resultado.membresia.estado})`);
  console.log(`Cita: ${resultado.reserva.entrenador}, ${new Date(resultado.reserva.inicio).toISOString()}`);
  console.log(`Compra simulada: ${resultado.pedido.referencia}, total COP ${resultado.pedido.total}`);
}
