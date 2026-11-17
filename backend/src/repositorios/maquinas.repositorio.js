export function crearMaquinasRepositorio(db) {
  return {
    async listar() {
      return (await db()).collection('maquinas').find().toArray();
    },
  };
}
