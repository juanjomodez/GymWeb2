export function crearMaquinasRepositorio(db, session) {
  return {
    async listar() {
      return (await db()).collection('maquinas').find({}, { session }).toArray();
    },
  };
}
