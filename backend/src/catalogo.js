// Datos de catálogo de GymFlow. `sembrarCatalogo` hace upsert por _id: se puede ejecutar
// varias veces y nunca toca datos de usuarios (membresías, reservas, carritos, pedidos).
import { MAQUINAS } from '../../js/maquinas.js';

const horas = (desde, hasta) => Array.from({ length: hasta - desde }, (_, i) => `${String(desde + i).padStart(2, '0')}:00`);
const semana = (manana, tarde, sabado) => [
  ...[1, 2, 3, 4, 5].map(dia => ({ dia, horas: [...horas(...manana), ...horas(...tarde)] })),
  ...(sabado ? [{ dia: 6, horas: horas(...sabado) }] : []),
];

export const PLANES = [
  {
    _id: 'basico', nombre: 'Plan Básico', orden: 1, precioMensual: 60000, maxPersonas: 1, incluyeEntrenador: false,
    descripcion: 'La opción ideal para entrenar en el gimnasio de forma independiente.',
    beneficios: ['Acceso al gimnasio durante el tiempo contratado.', 'Acceso a rutinas generales.', 'Sin acceso a entrenadores.'],
  },
  {
    _id: 'familiar', nombre: 'Plan Familiar', orden: 2, precioMensual: 150000, maxPersonas: 5, incluyeEntrenador: false,
    descripcion: 'Una opción para entrenar y disfrutar del gimnasio junto a otras personas.',
    beneficios: ['Acceso al gimnasio para un máximo de 5 personas.', 'Acceso a rutinas generales.', 'Sin acceso personalizado a entrenadores.'],
  },
  {
    _id: 'premium', nombre: 'Plan Premium', orden: 3, precioMensual: 100000, maxPersonas: 1, incluyeEntrenador: true,
    descripcion: 'La experiencia más completa para quienes buscan acompañamiento durante su entrenamiento.',
    beneficios: ['Acceso al gimnasio y rutinas de entrenamiento.', 'Chat directo con entrenadores.', 'Programación de citas con entrenadores.'],
  },
  {
    _id: 'premium-familiar', nombre: 'Plan Premium Familiar', orden: 4, precioMensual: 350000, maxPersonas: 5, incluyeEntrenador: true,
    descripcion: 'Todo el Plan Premium para un máximo de 5 personas.',
    beneficios: ['Acceso para un máximo de 5 personas.', 'Rutinas de entrenamiento.', 'Chat directo y citas con entrenadores.'],
  },
].map(p => ({ ...p, activo: true }));

export const ENTRENADORES = [
  {
    _id: 'carlos-rodriguez', nombre: 'Carlos Rodríguez', especialidad: 'Fuerza y rendimiento', imagen: 'img/entrenador1.jpg', zona: 'Zona de peso libre',
    descripcion: 'Especializado en aumento de fuerza, levantamiento de peso y mejora del rendimiento físico.',
    horario: semana([6, 10], [17, 20], [8, 12]),
  },
  {
    _id: 'laura-martinez', nombre: 'Laura Martínez', especialidad: 'Entrenamiento funcional', imagen: 'img/entrenador2.jpg', zona: 'Zona funcional',
    descripcion: 'Enfocada en movilidad, resistencia, coordinación y ejercicios funcionales.',
    horario: semana([7, 11], [16, 19], [9, 12]),
  },
  {
    _id: 'andres-gomez', nombre: 'Andrés Gómez', especialidad: 'Hipertrofia y musculación', imagen: 'img/entrenador3.jpg', zona: 'Máquinas guiadas',
    descripcion: 'Especializado en desarrollo muscular y planificación de rutinas para ganar masa muscular.',
    horario: semana([5, 9], [18, 21]),
  },
  {
    _id: 'valentina-torres', nombre: 'Valentina Torres', especialidad: 'Pérdida de grasa y acondicionamiento', imagen: 'img/entrenador4.jpg', zona: 'Zona de cardio',
    descripcion: 'Enfocada en entrenamiento cardiovascular, quema de grasa y mejora de la condición física.',
    horario: semana([6, 9], [15, 19], [7, 11]),
  },
  {
    _id: 'sebastian-ramirez', nombre: 'Sebastián Ramírez', especialidad: 'Entrenamiento deportivo', imagen: 'img/entrenador5.jpg', zona: 'Zona funcional',
    descripcion: 'Especializado en preparación física, velocidad, potencia y rendimiento para diferentes deportes.',
    horario: semana([8, 12], [17, 21], [8, 11]),
  },
].map(e => ({ ...e, activo: true }));

const ej = (nombre, series, repeticiones, descansoSeg, musculos, maquinaId) => ({ nombre, series, repeticiones, descansoSeg, musculos, ...(maquinaId ? { maquinaId } : {}) });

export const RUTINAS = [
  {
    _id: 'base-de-fuerza', nombre: 'Base de fuerza', objetivo: 'fuerza', nivel: 'principiante', diasPorSemana: 3, duracionMin: 60,
    descripcion: 'Rutina de cuerpo completo con los levantamientos básicos para construir una base sólida.',
    ejercicios: [
      ej('Sentadilla con barra', 4, '5', 150, ['cuadriceps', 'gluteos'], 'rack-sentadilla'),
      ej('Press de banca', 4, '5', 150, ['pectorales', 'triceps'], 'press-banca'),
      ej('Jalón al pecho', 3, '8', 90, ['dorsales', 'biceps'], 'polea-alta'),
      ej('Swing con pesa rusa', 3, '12', 60, ['gluteos', 'isquiotibiales'], 'pesa-rusa'),
      ej('Plancha frontal', 3, '30 s', 45, ['abdominales']),
    ],
  },
  {
    _id: 'fuerza-intermedia', nombre: 'Fuerza 4 días', objetivo: 'fuerza', nivel: 'intermedio', diasPorSemana: 4, duracionMin: 75,
    descripcion: 'División torso/pierna con cargas altas y progresión semanal.',
    ejercicios: [
      ej('Sentadilla con barra', 5, '3–5', 180, ['cuadriceps', 'gluteos'], 'rack-sentadilla'),
      ej('Prensa de piernas', 3, '8', 120, ['cuadriceps', 'gluteos'], 'prensa'),
      ej('Press de banca', 5, '3–5', 180, ['pectorales', 'triceps', 'deltoides'], 'press-banca'),
      ej('Curl de bíceps alterno', 3, '8', 75, ['biceps', 'antebrazos'], 'mancuernas'),
    ],
  },
  {
    _id: 'construccion-muscular', nombre: 'Construcción muscular', objetivo: 'hipertrofia', nivel: 'intermedio', diasPorSemana: 4, duracionMin: 70,
    descripcion: 'Volumen moderado-alto por grupo muscular, ideal para ganar masa.',
    ejercicios: [
      ej('Press de banca', 4, '8–12', 90, ['pectorales', 'triceps'], 'press-banca'),
      ej('Jalón al pecho', 4, '10–12', 75, ['dorsales', 'biceps'], 'polea-alta'),
      ej('Prensa de piernas', 4, '10–15', 90, ['cuadriceps', 'gluteos'], 'prensa'),
      ej('Curl de bíceps alterno', 3, '12', 60, ['biceps'], 'mancuernas'),
      ej('Elevación de gemelos', 4, '15', 45, ['gemelos']),
    ],
  },
  {
    _id: 'hipertrofia-principiante', nombre: 'Primeros músculos', objetivo: 'hipertrofia', nivel: 'principiante', diasPorSemana: 3, duracionMin: 50,
    descripcion: 'Rutina en máquinas guiadas para aprender la técnica mientras ganas masa muscular.',
    ejercicios: [
      ej('Prensa de piernas', 3, '12', 90, ['cuadriceps', 'gluteos'], 'prensa'),
      ej('Jalón al pecho', 3, '12', 75, ['dorsales', 'biceps'], 'polea-alta'),
      ej('Press de banca con mancuernas', 3, '12', 75, ['pectorales', 'triceps'], 'mancuernas'),
    ],
  },
  {
    _id: 'resistencia-y-movilidad', nombre: 'Resistencia y movilidad', objetivo: 'resistencia', nivel: 'principiante', diasPorSemana: 3, duracionMin: 45,
    descripcion: 'Circuitos de movimiento y acondicionamiento físico general.',
    ejercicios: [
      ej('Pedaleo por intervalos', 1, '20 min', 0, ['cuadriceps', 'gemelos'], 'bicicleta'),
      ej('Ondas alternas con cuerdas', 4, '30 s', 30, ['deltoides', 'abdominales'], 'cuerdas'),
      ej('Salto al cajón', 4, '8', 60, ['cuadriceps', 'gluteos'], 'cajon'),
      ej('Swing con pesa rusa', 3, '15', 45, ['gluteos', 'isquiotibiales'], 'pesa-rusa'),
    ],
  },
  {
    _id: 'quema-grasa-hiit', nombre: 'Quema grasa HIIT', objetivo: 'perdida-grasa', nivel: 'intermedio', diasPorSemana: 4, duracionMin: 40,
    descripcion: 'Intervalos de alta intensidad que combinan cardio y trabajo funcional.',
    ejercicios: [
      ej('Carrera inclinada', 1, '15 min', 0, ['cuadriceps', 'gemelos'], 'caminadora'),
      ej('Ondas alternas con cuerdas', 6, '20 s', 40, ['deltoides', 'abdominales', 'oblicuos'], 'cuerdas'),
      ej('Swing con pesa rusa', 5, '20', 40, ['gluteos', 'isquiotibiales'], 'pesa-rusa'),
      ej('Salto al cajón', 5, '10', 40, ['cuadriceps', 'gluteos'], 'cajon'),
    ],
  },
];

export const PRODUCTOS = [
  { _id: 'proteina', nombre: 'Proteína', descripcion: 'Suplemento para complementar tu alimentación.', precio: 150000, imagen: 'img/proteina.jpg', categoria: 'suplementos', stock: 40 },
  { _id: 'creatina', nombre: 'Creatina', descripcion: 'Complemento para mejorar el rendimiento deportivo.', precio: 80000, imagen: 'img/creatina.jpg', categoria: 'suplementos', stock: 60 },
  { _id: 'shaker', nombre: 'Shaker', descripcion: 'Shaker para preparar tus bebidas y suplementos.', precio: 35000, imagen: 'img/shaker.jpg', categoria: 'accesorios', stock: 100 },
].map(p => ({ ...p, activo: true }));

export const MAQUINAS_DB = MAQUINAS.map(({ id, ...m }) => ({ _id: id, ...m }));

export async function sembrarCatalogo(db) {
  const conjuntos = { planes: PLANES, entrenadores: ENTRENADORES, rutinas: RUTINAS, maquinas: MAQUINAS_DB };
  for (const [coleccion, docs] of Object.entries(conjuntos)) {
    await db.collection(coleccion).bulkWrite(docs.map(doc => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })));
  }
  // El stock cambia con las ventas: solo se fija al crear el producto.
  await db.collection('productos').bulkWrite(PRODUCTOS.map(({ stock, ...p }) => ({
    updateOne: { filter: { _id: p._id }, update: { $set: p, $setOnInsert: { stock } }, upsert: true },
  })));
}
