// Consultas a la colección `archivos` (metadatos de los ficheros guardados en disco o en GridFS).
// Aquí no hay reglas de negocio: solo lectura y escritura en MongoDB.
import { comoId } from './ids.js';

export function crearArchivosRepositorio(db, session) {
  const coleccion = async () => (await db()).collection('archivos');
  return {
    async porOperacion(modulo, operacion) {
      return (await coleccion()).findOne({ modulo, operacion }, { session });
    },
    // Archivos (solo `operacion`) de las operaciones indicadas, para enlazarlas o saber cuáles faltan.
    async deOperaciones(modulo, operaciones) {
      if (!operaciones.length) return [];
      return (await coleccion()).find({ modulo, operacion: { $in: operaciones } }, { projection: { operacion: 1 }, session }).toArray();
    },
    async crear(archivo) {
      const documento = { ...archivo, autor: comoId(archivo.autor) };
      const { insertedId } = await (await coleccion()).insertOne(documento, { session });
      return { ...documento, _id: insertedId };
    },
    async listarDelAutor(autor, { modulo, limite = 100 } = {}) {
      return (await coleccion())
        .find({ autor: comoId(autor), ...(modulo ? { modulo } : {}) }, { projection: { datos: 0, ruta: 0 }, session })
        .sort({ fecha: -1, _id: -1 }).limit(limite).toArray();
    },
    // Solo devuelve el archivo si pertenece a `autor`: nadie puede abrir archivos ajenos.
    async delAutor(autor, id) {
      const _id = /^[a-f0-9]{24}$/.test(String(id)) ? comoId(id) : null;
      return _id ? (await coleccion()).findOne({ _id, autor: comoId(autor) }, { session }) : null;
    },
    async eliminarPorOperacion(modulo, operacion) {
      return (await coleccion()).deleteOne({ modulo, operacion }, { session });
    },
  };
}
