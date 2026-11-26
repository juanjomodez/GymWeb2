// Consultas a la colección `archivos` (metadatos de los ficheros guardados en disco o en GridFS).
// Aquí no hay reglas de negocio: solo lectura y escritura en MongoDB.
import { ObjectId } from 'mongodb';

const coleccion = base => base.collection('archivos');
const comoId = id => (/^[a-f0-9]{24}$/.test(String(id)) ? new ObjectId(String(id)) : null);

export const repositorioArchivos = {
  porOperacion(base, modulo, operacion) {
    return coleccion(base).findOne({ modulo, operacion });
  },
  // Operaciones de un módulo que ya tienen archivo, entre las indicadas.
  async operacionesConArchivo(base, modulo, operaciones) {
    if (!operaciones.length) return new Set();
    const docs = await coleccion(base).find({ modulo, operacion: { $in: operaciones } }, { projection: { operacion: 1 } }).toArray();
    return new Set(docs.map(d => d.operacion));
  },
  deOperaciones(base, modulo, operaciones) {
    if (!operaciones.length) return [];
    return coleccion(base).find({ modulo, operacion: { $in: operaciones } }, { projection: { operacion: 1 } }).toArray();
  },
  async insertar(base, archivo) {
    const { insertedId } = await coleccion(base).insertOne(archivo);
    return { ...archivo, _id: insertedId };
  },
  listarDelAutor(base, autor, { modulo, limite = 100 } = {}) {
    return coleccion(base)
      .find({ autor, ...(modulo ? { modulo } : {}) }, { projection: { datos: 0, ruta: 0 } })
      .sort({ fecha: -1, _id: -1 }).limit(limite).toArray();
  },
  // Solo devuelve el archivo si pertenece a `autor`: así nadie puede abrir archivos ajenos.
  delAutor(base, autor, id) {
    const _id = comoId(id);
    return _id ? coleccion(base).findOne({ _id, autor }) : null;
  },
  eliminarPorOperacion(base, modulo, operacion) {
    return coleccion(base).deleteOne({ modulo, operacion });
  },
};
