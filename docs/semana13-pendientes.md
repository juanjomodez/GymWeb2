# Semana 13: subida de archivos (foto de perfil) — lo hecho y lo que falta

## Hecho

- Pestaña **Editar perfil** en `micuenta.html` (ruta privada: sin sesión redirige a login).
- Endpoint `POST /api/perfil/foto` con `multipart/form-data` (campo `foto`, JPG/PNG/WebP, máx. 2 MB).
- La foto se guarda en MongoDB con GridFS (bucket `fotos`) y la referencia en `usuarios.foto`.
- `GET/PATCH /api/perfil` para editar nombre, teléfono y objetivo. `DELETE /api/perfil/foto` para quitarla.
- La foto aparece junto al saludo de "Mi cuenta".
- Pruebas HTTP sin MongoDB en `backend/test/perfil.test.js` (pasan con `npm test`).

Archivos tocados: `backend/src/api.js`, `backend/src/database.js`, `backend/src/esquema.js`,
`backend/package.json` (+ `multer`), `micuenta.html`, `js/cuenta.js`, `cuenta.css`, `backend/README.md`.

**Importante:** después de copiar los cambios, correr `npm install` dentro de `backend/` (se agregó `multer`).

## Para quien actualiza el diagrama ER (`docs/Diagrama ER Gym.pdf`)

En la entidad **Usuario** agregar:

| Atributo | Tipo | Notas |
|---|---|---|
| telefono | string, opcional | 7–20 dígitos, puede empezar con + |
| objetivo | enum, opcional | fuerza, hipertrofia, resistencia, perdida-grasa |
| foto | objeto embebido, opcional | `archivoId` (ObjectId), `url`, `tipo` (image/jpeg, image/png, image/webp), `tamano` (bytes, ≤ 2 MB), `subidaAt` |
| updatedAt | fecha | ya existía en el validador |

Nueva entidad **FotoPerfil** (GridFS `fotos.files`): `_id`, `filename`, `length`, `contentType`,
`uploadDate`, `metadata.usuarioId`. Relación **Usuario 1 — 0..1 FotoPerfil** (`usuarios.foto.archivoId` → `fotos.files._id`).
Los bytes van en `fotos.chunks` (lo maneja el driver; se puede dibujar como detalle de FotoPerfil).

## Para quien hace las pruebas

Ya cubierto en `test/perfil.test.js` (base falsa): 401 sin sesión, validaciones del PATCH,
archivo falso con extensión `.png` → 415, campo equivocado → 400, más de 2 MB → 413, subida OK → 201,
descarga con el `Content-Type` correcto, 404 de foto inexistente y borrado.

Falta (necesita MongoDB en memoria, como `test/api.test.js`):

1. Prueba de integración: subir foto y comprobar que existe en `fotos.files` y que `usuarios.foto.archivoId` coincide.
2. Subir una segunda foto y comprobar que la primera se borró de GridFS.
3. `DELETE /api/perfil/foto` deja `usuarios` sin `foto` y borra el archivo.
4. El validador rechaza un `telefono` inválido insertado directo en la colección (código 121).
5. Prueba manual en el navegador: subir JPG, PNG y WebP; probar un PDF renombrado a .jpg.

Nota: esas pruebas de integración no se pudieron ejecutar en el entorno donde se programó esto
(no deja descargar el binario de MongoDB), así que conviene correr `npm test` completo en un PC del equipo.

## Para quien pule la interfaz

La interfaz de "Editar perfil" es básica a propósito (`cuenta.css`, sección "Editar perfil").
Ideas: botón de archivo con estilo propio, recorte/vista previa circular, mostrar la foto también en el
menú superior, permitir cambiar contraseña.
