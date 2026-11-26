export function crearRutinasRepositorio(db, session) {
  return {
    async listar(objetivo) {
      return (await db()).collection('rutinas').find(objetivo ? { objetivo } : {}, { projection: { ejercicios: 0 }, session }).sort({ objetivo: 1, nivel: 1 }).toArray();
    },
    async buscarPorId(id) {
      return (await db()).collection('rutinas').findOne({ _id: id }, { session });
    },
  };
}
