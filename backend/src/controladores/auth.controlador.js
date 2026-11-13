// Registro, inicio y cierre de sesión. Las validaciones de entrada ya pasaron por middlewares/validar.js.
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../registration.js';
import { ErrorHttp } from '../middlewares/errores.js';
import { COOKIE_SESION, DURACION_SESION, hashToken, leerToken, opcionesCookie } from '../middlewares/autenticacion.js';

const MAX_INTENTOS = 10;
const VENTANA_INTENTOS = 15 * 60 * 1000;
const MAX_CONCURRENTES = 4;

export function crearAuthControlador(servicios, { usuarioDeSesion }) {
  const intentos = new Map();
  let loginsActivos = 0;
  let registrosActivos = 0;
  // Mismo trabajo criptografico para correos inexistentes (no revela que correos existen)
  const hashFicticio = hashPassword(randomBytes(32).toString('hex'));

  return {
    // POST /api/usuarios
    async registrar(request, response) {
      const { nombre, correo, password } = request.valido.body;
      // El hash scrypt usa mucha CPU: se limitan los registros simultáneos.
      if (registrosActivos >= MAX_CONCURRENTES) throw new ErrorHttp(429, 'Hay muchas solicitudes. Intenta nuevamente en unos segundos.');
      registrosActivos++;
      try {
        const passwordHash = await hashPassword(password);
        const usuario = await servicios.createUser({ nombre, correo, passwordHash, createdAt: new Date() });
        response.status(201).json({ message: 'Cuenta creada correctamente.', usuario });
      } catch (error) {
        if (error.code === 11000) throw new ErrorHttp(409, 'Ya existe una cuenta con ese correo.');
        throw new ErrorHttp(503, 'No se pudo guardar la cuenta. Intenta más tarde.');
      } finally {
        registrosActivos--;
      }
    },

    // POST /api/login
    async iniciarSesion(request, response) {
      const { correo, password } = request.valido.body;
      const ahora = Date.now();
      for (const [clave, entrada] of intentos) if (entrada.hasta <= ahora) intentos.delete(clave);
      const clave = request.ip;
      const entrada = intentos.get(clave) || { cantidad: 0, hasta: ahora + VENTANA_INTENTOS };
      if (entrada.cantidad >= MAX_INTENTOS || loginsActivos >= MAX_CONCURRENTES || (intentos.size >= 10000 && !intentos.has(clave))) {
        response.set('Retry-After', String(Math.max(1, Math.ceil((entrada.hasta - ahora) / 1000))));
        throw new ErrorHttp(429, 'Demasiados intentos. Espera antes de volver a intentar.');
      }
      entrada.cantidad++;
      intentos.set(clave, entrada);
      loginsActivos++;
      try {
        const usuario = await servicios.findUserByEmail(correo);
        const valida = await verifyPassword(password, usuario?.passwordHash || await hashFicticio);
        if (!usuario || !valida) throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');
        const token = randomBytes(32).toString('hex');
        await servicios.createSession({ _id: hashToken(token), userId: usuario._id, expiresAt: new Date(ahora + DURACION_SESION) });
        // Rotación: la sesión anterior de este navegador deja de servir.
        const anterior = leerToken(request);
        if (anterior) await servicios.deleteSession(hashToken(anterior));
        response.cookie(COOKIE_SESION, token, { ...opcionesCookie(request), maxAge: DURACION_SESION });
        response.status(200).json({ message: 'Sesión iniciada.' });
      } finally {
        loginsActivos--;
      }
    },

    // GET /api/me (requiere sesion)
    yo(request, response) {
      response.json({ usuario: request.user });
    },

    // GET /api/sesion: para la navegacion publica; nunca responde 401.
    async estadoSesion(request, response) {
      const usuario = await usuarioDeSesion(request, response).catch(() => null);
      response.json({ usuario: usuario ? { nombre: usuario.nombre } : null });
    },

    // POST /api/logout
    async cerrarSesion(request, response) {
      const token = leerToken(request);
      if (token) await servicios.deleteSession(hashToken(token));
      response.clearCookie(COOKIE_SESION, opcionesCookie(request));
      response.json({ message: 'Sesión cerrada.' });
    },
  };
}