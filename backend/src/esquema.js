// Esquema de GymWeb: validadores $jsonSchema e índices de cada colección.
// `asegurarEsquema` es idempotente: crea lo que falta y actualiza validadores existentes.

const texto = (min, max) => ({ bsonType: 'string', minLength: min, maxLength: max });
const entero = (minimum, maximum) => ({ bsonType: ['int', 'long'], minimum, ...(maximum === undefined ? {} : { maximum }) });
const fecha = { bsonType: 'date' };
const slug = { bsonType: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', maxLength: 60 };
const MUSCULOS = ['pectorales', 'deltoides', 'biceps', 'triceps', 'antebrazos', 'abdominales', 'oblicuos', 'trapecio',
  'dorsales', 'lumbares', 'gluteos', 'cuadriceps', 'isquiotibiales', 'gemelos'];
export const OBJETIVOS = ['fuerza', 'hipertrofia', 'resistencia', 'perdida-grasa'];

const objeto = (required, properties) => ({ bsonType: 'object', required, additionalProperties: false, properties: { _id: {}, ...properties } });

export const COLECCIONES = {
  usuarios: {
    schema: objeto(['nombre', 'correo', 'passwordHash', 'rol', 'createdAt'], {
      nombre: texto(2, 100),
      correo: { bsonType: 'string', maxLength: 254, pattern: '^[^\\s@A-Z]+@[^\\s@A-Z]+\\.[^\\s@A-Z]+$' },
      passwordHash: { bsonType: 'string', pattern: '^scrypt\\$' },
      rol: { enum: ['cliente', 'admin'] },
      createdAt: fecha,
      updatedAt: fecha,
    }),
    indices: [[{ correo: 1 }, { unique: true, name: 'correo_unico' }]],
  },
  sesiones: {
    schema: objeto(['userId', 'expiresAt'], {
      _id: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
      userId: { bsonType: ['objectId', 'string'] },
      expiresAt: fecha,
    }),
    indices: [
      [{ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiracion_ttl' }],
      [{ userId: 1 }, { name: 'sesiones_por_usuario' }],
    ],
  },
  planes: {
    schema: objeto(['_id', 'nombre', 'descripcion', 'precioMensual', 'maxPersonas', 'incluyeEntrenador', 'beneficios', 'activo', 'orden'], {
      _id: slug,
      nombre: texto(2, 60),
      descripcion: texto(1, 400),
      precioMensual: entero(0),
      maxPersonas: entero(1, 10),
      incluyeEntrenador: { bsonType: 'bool' },
      beneficios: { bsonType: 'array', minItems: 1, items: texto(1, 200) },
      activo: { bsonType: 'bool' },
      orden: entero(0),
    }),
    indices: [[{ activo: 1, orden: 1 }, { name: 'planes_activos' }]],
  },
  membresias: {
    schema: objeto(['usuarioId', 'planId', 'plan', 'meses', 'precioPagado', 'fechaInicio', 'fechaFin', 'estado', 'renovacionAutomatica', 'pagos', 'createdAt'], {
      usuarioId: { bsonType: 'objectId' },
      planId: slug,
      // Copia del plan al comprar: un cambio de precio posterior no altera lo contratado.
      plan: objeto(['nombre', 'precioMensual', 'incluyeEntrenador', 'maxPersonas'], {
        nombre: texto(2, 60), precioMensual: entero(0), incluyeEntrenador: { bsonType: 'bool' }, maxPersonas: entero(1, 10),
      }),
      meses: { enum: [1, 3, 6, 12] },
      precioPagado: entero(0),
      fechaInicio: fecha,
      fechaFin: fecha,
      estado: { enum: ['activa', 'vencida', 'reemplazada'] },
      renovacionAutomatica: { bsonType: 'bool' },
      pagos: {
        bsonType: 'array',
        items: objeto(['referencia', 'monto', 'fecha', 'tipo'], {
          referencia: texto(6, 40), monto: entero(0), fecha, tipo: { enum: ['compra', 'extension', 'renovacion'] },
        }),
      },
      createdAt: fecha,
      updatedAt: fecha,
    }),
    indices: [
      // Una sola membresía activa por usuario, garantizado por la base de datos.
      [{ usuarioId: 1 }, { unique: true, partialFilterExpression: { estado: 'activa' }, name: 'una_activa_por_usuario' }],
      [{ usuarioId: 1, fechaInicio: -1 }, { name: 'historial_usuario' }],
      [{ estado: 1, fechaFin: 1 }, { name: 'vencimientos' }],
    ],
  },
  entrenadores: {
    schema: objeto(['_id', 'nombre', 'especialidad', 'descripcion', 'imagen', 'zona', 'horario', 'activo'], {
      _id: slug,
      nombre: texto(2, 100),
      especialidad: texto(2, 100),
      descripcion: texto(1, 400),
      imagen: texto(1, 200),
      zona: texto(1, 100),
      // Disponibilidad semanal en hora de Cali: día ISO (1 = lunes) y horas de inicio de cada sesión de 60 min.
      horario: {
        bsonType: 'array',
        items: objeto(['dia', 'horas'], {
          dia: entero(1, 7),
          horas: { bsonType: 'array', uniqueItems: true, items: { bsonType: 'string', pattern: '^([01][0-9]|2[0-3]):00$' } },
        }),
      },
      activo: { bsonType: 'bool' },
    }),
    indices: [[{ activo: 1, nombre: 1 }, { name: 'entrenadores_activos' }]],
  },
  reservas: {
    schema: objeto(['usuarioId', 'entrenadorId', 'inicio', 'fin', 'estado', 'createdAt'], {
      usuarioId: { bsonType: 'objectId' },
      entrenadorId: slug,
      inicio: fecha,
      fin: fecha,
      estado: { enum: ['confirmada', 'cancelada'] },
      createdAt: fecha,
      canceladaAt: fecha,
    }),
    indices: [
      // Un horario de un entrenador no puede reservarse dos veces (también con solicitudes simultáneas).
      [{ entrenadorId: 1, inicio: 1 }, { unique: true, partialFilterExpression: { estado: 'confirmada' }, name: 'horario_entrenador_unico' }],
      [{ usuarioId: 1, inicio: 1 }, { unique: true, partialFilterExpression: { estado: 'confirmada' }, name: 'horario_usuario_unico' }],
      [{ usuarioId: 1, inicio: -1 }, { name: 'reservas_usuario' }],
    ],
  },
  rutinas: {
    schema: objeto(['_id', 'nombre', 'objetivo', 'nivel', 'descripcion', 'diasPorSemana', 'duracionMin', 'ejercicios'], {
      _id: slug,
      nombre: texto(2, 80),
      objetivo: { enum: OBJETIVOS },
      nivel: { enum: ['principiante', 'intermedio', 'avanzado'] },
      descripcion: texto(1, 500),
      diasPorSemana: entero(1, 7),
      duracionMin: entero(10, 180),
      ejercicios: {
        bsonType: 'array',
        minItems: 1,
        items: objeto(['nombre', 'series', 'repeticiones', 'descansoSeg', 'musculos'], {
          nombre: texto(2, 80),
          series: entero(1, 10),
          repeticiones: texto(1, 30),
          descansoSeg: entero(0, 600),
          maquinaId: slug,
          musculos: { bsonType: 'array', minItems: 1, items: { enum: MUSCULOS } },
        }),
      },
    }),
    indices: [[{ objetivo: 1, nivel: 1 }, { name: 'rutinas_por_objetivo' }]],
  },
  productos: {
    schema: objeto(['_id', 'nombre', 'descripcion', 'precio', 'imagen', 'categoria', 'stock', 'activo'], {
      _id: slug,
      nombre: texto(2, 80),
      descripcion: texto(1, 400),
      precio: entero(0),
      imagen: texto(1, 200),
      categoria: { enum: ['suplementos', 'accesorios', 'ropa'] },
      stock: entero(0),
      activo: { bsonType: 'bool' },
    }),
    indices: [[{ activo: 1, categoria: 1 }, { name: 'productos_activos' }]],
  },
  carritos: {
    schema: objeto(['items', 'updatedAt'], {
      _id: { bsonType: 'objectId' },
      items: {
        bsonType: 'array',
        maxItems: 30,
        items: objeto(['productoId', 'cantidad'], { productoId: slug, cantidad: entero(1, 20) }),
      },
      updatedAt: fecha,
    }),
    indices: [],
  },
  pedidos: {
    schema: objeto(['usuarioId', 'items', 'total', 'estado', 'referencia', 'createdAt'], {
      usuarioId: { bsonType: 'objectId' },
      items: {
        bsonType: 'array',
        minItems: 1,
        items: objeto(['productoId', 'nombre', 'precioUnitario', 'cantidad', 'subtotal'], {
          productoId: slug, nombre: texto(2, 80), precioUnitario: entero(0), cantidad: entero(1, 20), subtotal: entero(0),
        }),
      },
      total: entero(0),
      estado: { enum: ['pagado', 'entregado', 'cancelado'] },
      referencia: texto(6, 40),
      createdAt: fecha,
    }),
    indices: [
      [{ usuarioId: 1, createdAt: -1 }, { name: 'pedidos_usuario' }],
      [{ referencia: 1 }, { unique: true, name: 'referencia_unica' }],
    ],
  },
  maquinas: {
    schema: objeto(['_id', 'area', 'nombre', 'ejercicio', 'descripcion', 'pasos', 'musculos'], {
      _id: slug,
      area: slug,
      nombre: texto(2, 80),
      ejercicio: texto(2, 80),
      descripcion: texto(1, 400),
      pasos: { bsonType: 'array', minItems: 1, items: texto(1, 300) },
      musculos: objeto(['principales', 'secundarios'], {
        principales: { bsonType: 'array', minItems: 1, items: { enum: MUSCULOS } },
        secundarios: { bsonType: 'array', items: { enum: MUSCULOS } },
      }),
    }),
    indices: [[{ area: 1 }, { name: 'maquinas_por_area' }]],
  },
};

export async function asegurarEsquema(db) {
  const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
  // Migración de la fase 3: las cuentas anteriores no tenían rol.
  if (existentes.has('usuarios')) await db.collection('usuarios').updateMany({ rol: { $exists: false } }, { $set: { rol: 'cliente' } });
  for (const [nombre, { schema, indices }] of Object.entries(COLECCIONES)) {
    const validacion = { validator: { $jsonSchema: schema }, validationLevel: 'strict', validationAction: 'error' };
    if (existentes.has(nombre)) await db.command({ collMod: nombre, ...validacion });
    else await db.createCollection(nombre, validacion);
    for (const [clave, opciones] of indices) await db.collection(nombre).createIndex(clave, opciones);
  }
}
