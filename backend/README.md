# Gym — Backend

El contrato completo de las rutas, sus entradas, autenticación, respuestas y códigos
HTTP está en [docs/API.md](../docs/API.md).

## Semana 13: edición de perfil y foto de perfil

La página privada `micuenta.html` incluye **Editar perfil** para actualizar nombre,
teléfono y objetivo, y subir, reemplazar o eliminar una foto. El registro y login
siguen usando la base de datos; estas operaciones se aplican al usuario identificado
por la cookie `gym_session`.

### Endpoints y validaciones

| Método y ruta | Acceso | Función y respuesta |
|---|---|---|
| `GET /api/perfil` | Privado | `200` con `{ perfil }`: ID, nombre, correo, teléfono, objetivo y URL de foto. |
| `PATCH /api/perfil` | Privado | Actualiza al menos uno de `nombre`, `telefono`, `objetivo`; `200` con mensaje y perfil actualizado. |
| `POST /api/perfil/foto` | Privado | Recibe un archivo en el campo `foto` de `multipart/form-data`; `201` con mensaje y perfil actualizado. |
| `DELETE /api/perfil/foto` | Privado | Retira la referencia e intenta borrar la foto de GridFS; `200`, también si ya no tenía foto. |
| `GET /api/fotos/:id` | Público | Devuelve los bytes de la imagen y su `Content-Type`; `200` o `404` si no existe/el ID es inválido. |

El nombre se recorta y debe medir de 2 a 100 caracteres. El teléfono se recorta y
debe cumplir `^\+?[0-9 ]{7,20}$`. El objetivo admite `fuerza`, `hipertrofia`,
`resistencia` o `perdida-grasa`. Una cadena vacía en teléfono u objetivo borra ese
campo; un PATCH sin cambios admitidos devuelve `400`.

Se aceptan **JPEG, PNG y WebP**, hasta **2 MiB (2 097 152 bytes)**. Multer limita
el formulario a un archivo y el backend identifica el formato por su firma de
bytes. Cambiar la extensión de un PDF a `.jpg` no lo convierte en una foto válida.
Las rutas privadas responden `401` sin sesión; los formularios inválidos devuelven
`400`, los archivos demasiado grandes `413`, los formatos no admitidos `415` y los
fallos de MongoDB `503`. Las escrituras también comprueban el origen (`403`).
El detalle de entradas y códigos está en [la documentación de perfil y fotos](../docs/API.md#perfil-y-fotos-semana-13).

### Almacenamiento e índice

Las fotos se procesan en memoria y se almacenan en MongoDB mediante el bucket
GridFS `fotos`: metadatos en `fotos.files` y bytes fragmentados en `fotos.chunks`.
`usuarios.foto` contiene `archivoId`, `url`, `tipo`, `tamano`, `subidaAt`.
Los metadatos de GridFS incluyen `usuarioId` y `tipo`.

`src/esquema.js` crea de forma idempotente el índice `fotos_por_usuario`, con clave
`{ "metadata.usuarioId": 1 }`, sobre `fotos.files`, incluso antes de la primera
subida. No es único: durante un reemplazo se guarda primero la nueva foto, se
actualiza la referencia del usuario y después se intenta borrar la anterior.
Los índices internos y la estructura de GridFS los administra el driver.

La URL de descarga es pública para quien la conoce y cada subida genera un ID
nuevo. La respuesta permite caché por un año; una copia ya descargada puede seguir
en el navegador después del borrado. No se guardan fotos en `img/` ni en otro
directorio público del proyecto.

### Comprobar la semana 13

Desde `backend/`, ejecutar `npm ci` si faltan dependencias y después
`npm run dev:memoria` para probar con una base temporal sin Atlas. Abrir
`http://127.0.0.1:3000/`, registrar una cuenta, iniciar sesión y entrar a **Mi cuenta**.
En **Editar perfil**, guardar nombre, teléfono y objetivo, subir una imagen válida,
recargar para comprobar su persistencia, reemplazarla y finalmente eliminarla.
Comprobar también un PDF renombrado (`415`) y una imagen de más de 2 MiB (`413`).
La base temporal se pierde al detener el proceso. Para usar Atlas, configurar
`backend/.env` y ejecutar `npm start`. Si `/health` devuelve `503`, resolver la
configuración o conexión antes de esperar respuestas exitosas del catálogo y perfil.

`npm test`, desde `backend/`, ejecuta las pruebas de perfil con base simulada y las
de integración existentes con MongoDB temporal. La prueba de esquema comprueba
la clave del índice de fotos y que repetir la preparación no lo duplique.
Las pruebas de persistencia, reemplazo y borrado de archivos con MongoDB y la
actualización del diagrama ER siguen detalladas en
[docs/semana13-pendientes.md](../docs/semana13-pendientes.md).

## Publicar en la web (Render + MongoDB Atlas)

Un solo servicio de Render sirve la página y la API (mismo dominio, cookies seguras).
`render.yaml` en la raíz del repositorio deja todo configurado.

1. **Atlas**: crea un clúster gratuito M0 (AWS, N. Virginia — cerca de Render `virginia`).
   - *Database Access*: usuario con contraseña larga aleatoria y solo `readWrite` sobre `GymWeb`.
   - *Network Access*: Render gratuito no tiene IP fija, así que hay que permitir `0.0.0.0/0`.
     La protección queda en la contraseña del usuario y en sus permisos limitados a `GymWeb`.
   - *Connect → Drivers*: copia la URI `mongodb+srv://…` con tu usuario y contraseña.
2. **Render**: *New → Blueprint* → elige este repositorio. Cuando pida `MONGODB_URI`, pega la URI.
   Cada push a `main` vuelve a publicar.
3. Al arrancar, el servidor crea colecciones, validadores, índices y catálogo (`/health` muestra
   si la base responde). Render comprueba `/vivo`, que no depende de la base.

El plan gratuito de Render se suspende tras 15 minutos sin visitas; la siguiente visita tarda
cerca de un minuto en despertar el servidor.

Variables: `MONGODB_URI` (secreta), `MONGODB_DB=GymWeb`, `HOST=0.0.0.0`, `TRUST_PROXY=1`
(confía en el proxy HTTPS de Render para cookies `Secure`, HSTS y el control de origen).

## Fase 4: base de datos completa y funciones de cuenta

Base `GymWeb` en MongoDB. Al iniciar, el servidor crea o actualiza cada colección con su
validador `$jsonSchema` (`validationLevel: strict`), sus índices y el catálogo. Es idempotente:
`npm run db:preparar` hace lo mismo a mano contra Atlas y nunca toca datos de usuarios.

| Colección | Contenido | Índices y reglas clave |
|---|---|---|
| `usuarios` | nombre, correo, hash scrypt, rol, teléfono, objetivo y referencia de foto | `correo` único |
| `fotos.files` | metadatos de la foto y `metadata.usuarioId` | `fotos_por_usuario` sobre `metadata.usuarioId`; índices internos de GridFS |
| `fotos.chunks` | fragmentos binarios de las fotos | índices administrados por GridFS |
| `sesiones` | SHA-256 del token, usuario, expiración | TTL sobre `expiresAt` |
| `planes` | precio mensual, personas, beneficios, si incluye entrenador | `_id` legible (`basico`, `premium`…) |
| `membresias` | copia del plan, meses, fechas, estado, renovación, pagos simulados | **una sola activa por usuario** (índice único parcial) |
| `entrenadores` | especialidad, zona, horario semanal (hora de Cali) | — |
| `reservas` | usuario, entrenador, inicio/fin, estado | **un horario de entrenador no se reserva dos veces** (único parcial) |
| `rutinas` | objetivo, nivel, ejercicios con series y músculos | por objetivo |
| `productos` | precio, imagen, stock | — |
| `carritos` | `_id` = usuario, productos y cantidades | máx. 30 productos, 1–20 unidades |
| `pedidos` | líneas con precio congelado, total, referencia | referencia única |
| `maquinas` | datos de `js/maquinas.js` (fuente única) | por área |

Reglas de negocio (en `src/database.js`):

- **Compra de membresía** (transacción): mismo plan → se suma el tiempo; otro plan → la anterior
  queda `reemplazada` y la nueva empieza hoy. Duraciones de 1, 3, 6 o 12 meses.
- **Vencimiento y renovación automática**: al consultar la cuenta, una membresía vencida se renueva
  (pago simulado registrado) si la renovación está activa; si no, pasa a `vencida`.
- **Reservas**: solo con Plan Premium activo, en horas del horario del entrenador, hasta 30 días
  adelante y máximo 4 citas pendientes. Los choques simultáneos los rechaza el índice único (409).
- **Pedidos** (transacción): descuenta stock solo si alcanza; si un producto no alcanza, se revierte
  todo. Vacía el carrito al terminar.

Las transacciones requieren un *replica set*: Atlas (incluido el nivel gratuito) lo es.

### API

Ver [docs/API.md](../docs/API.md) para todas las rutas de salud, registro,
autenticación, catálogo, perfil, fotos, membresías, reservas, carrito y pedidos.
Las rutas privadas usan la cookie de sesión. El catálogo y la descarga de fotos
son públicos; el detalle de rutinas requiere sesión. Toda escritura bajo `/api`
rechaza un `Origin` externo si se envía esa cabecera; los errores no exponen
detalles del driver.

### Probar sin Atlas

```powershell
cd backend
npm run dev:memoria
```

Arranca la web en http://127.0.0.1:3000 con un MongoDB temporal en memoria (los datos se pierden al
cerrarlo). La primera vez descarga el binario oficial de `mongod`. `npm test` usa el mismo mecanismo
para las pruebas de integración (esquema, membresías, reservas, carrito y pedidos).

## Fase 3: inicio de sesión y Mi cuenta

Reinicia `npm start` y abre **http://127.0.0.1:3000/login.html** (no Live Server).
Usa el correo y contraseña de una cuenta registrada. El login redirige a
`micuenta.html`, muestra el nombre y correo reales y permite cerrar sesión.
Sin una sesión válida, Express redirige esa página al login y la API responde 401.
El formulario de registro no inicia sesión automáticamente.

- `POST /api/login`: valida credenciales y crea la cookie `gym_session`.
- `GET /api/me`: devuelve ID, nombre, correo, rol y URL de foto del usuario autenticado.
- `POST /api/logout`: elimina la sesión de MongoDB y borra la cookie.

Las sesiones duran ocho horas, persisten entre reinicios y se guardan en
`GymWeb.sesiones`. La cookie contiene un token aleatorio de 32 bytes; en MongoDB
se guarda su SHA-256, el ID del usuario y la fecha de expiración. Un índice TTL
limpia sesiones vencidas; la API también verifica la fecha, sin esperar al TTL.
Un nuevo login reemplaza la sesión de la cookie anterior. Las contraseñas se
comprueban con scrypt y comparación de tiempo constante. Los errores de correo
inexistente y contraseña errónea muestran el mismo mensaje.

La cookie es HttpOnly y SameSite=Strict; con HTTPS también usa Secure.
Los POST rechazan un Origin distinto del servidor. No se almacenan tokens en
localStorage. Se permiten diez intentos de login por IP cada quince minutos y
cuatro verificaciones concurrentes. Ese límite vive en memoria y se reinicia
con Node; para un despliegue con varias instancias se necesita un límite compartido.
Por defecto el servidor escucha en localhost. El despliegue con HTTPS usa la
configuración explícita del proxy descrita al principio del README.

`npm test` prueba login, datos incorrectos, límite de intentos, protección de
cuenta, expiración, rotación, logout y origen externo. `npm run verify:atlas`
comprueba además ese flujo con una cuenta temporal en Atlas y limpia sus datos
y sesiones. Las membresías están implementadas como se describe en la fase 4.

## Fase 2: registro de usuarios

Con el backend reiniciado mediante `npm start`, abre
**http://127.0.0.1:3000/registro.html**. Completa el formulario y pulsa
Registrarse. La página llama a `POST /api/usuarios` en el mismo origen;
no necesita CORS. Abrir directamente el archivo HTML no permite registrar.

El cuerpo JSON contiene `nombre`, `correo` y `password`. La API valida tipos
y límites, normaliza el correo a minúsculas, devuelve 201 al crear una cuenta,
400 ante datos inválidos, 409 ante correo duplicado y 503 si falla MongoDB.
La respuesta solo contiene ID, nombre y correo, además de un mensaje.

MongoDB crea `GymWeb.usuarios` durante el primer registro, con un índice único
sobre `correo`. Se almacenan `nombre`, `correo`, `passwordHash` y `createdAt`.
El hash usa scrypt (N=32768, r=8, p=1), sal aleatoria de 16 bytes y clave de
64 bytes mediante `node:crypto`; no se guarda la contraseña original.
El índice único evita duplicados incluso con solicitudes simultáneas.
Si ya existen correos duplicados en la colección, habrá que resolverlos antes
de que el índice pueda crearse; no se eliminan datos automáticamente.

Comprueba el registro con una cuenta de prueba propia y revisa el documento
en Atlas → Browse Collections → GymWeb → usuarios. Repetir el mismo correo
debe mostrar el aviso de duplicado. No incluyas hashes ni credenciales en capturas.
Las pruebas automatizadas de esta fase usan una DB simulada y no crean cuentas
en Atlas. `npm test` comprueba validación, hash verificable, respuestas y bloqueo
de archivos privados. `npm run verify:atlas` hace una prueba explícita con la
configuración local: crea una cuenta temporal, comprueba su hash y el rechazo
de duplicados, y elimina esa cuenta al finalizar. Crea la colección y su índice
si aún no existen. Si falla la limpieza, el comando informa el fallo.
El registro no inicia sesión automáticamente ni activa membresías.
Para uso público se requiere HTTPS y protección
contra abuso adicional; esta fase escucha solo en localhost.

## Arquitectura y alcance

El frontend existente vive en la raíz (HTML, CSS, JavaScript e imágenes).
El backend independiente vive en `backend/`: Node.js, Express y controlador
oficial `mongodb`, sin Docker, Mongoose ni dependencia adicional para `.env`.
Node carga `backend/.env` mediante su API nativa, sin importar desde dónde
se inicie el proceso. Las variables del entorno tienen prioridad.

Flujo actual: navegador → API Express → MongoDB Atlas (`GymWeb`) o MongoDB temporal.
El Avance 1 implementó `GET /health`; las fases posteriores añadieron registro,
sesiones, catálogo, funciones de cuenta y subida de fotos. Express sirve los
archivos públicos mediante una lista explícita, sin exponer el backend.
Abrir la portada desde Express permite cargar los catálogos y usar las funciones
de cuenta; abrir los HTML como archivos locales no permite consultar la API.

- `src/config.js`: configuración local.
- `src/database.js`: pool del driver, persistencia, reglas de negocio, GridFS y ping real.
- `src/esquema.js`: validadores, migración de rol e índices de las colecciones.
- `src/api.js`: catálogo, perfil, fotos, membresías, reservas, carrito y pedidos.
- `src/auth.js`: sesiones, cookies, control de origen y protección de rutas.
- `src/app.js`: composición de rutas, registro, archivos públicos y respuestas ante fallos.
- `src/server.js`: inicio y cierre del servidor.
- `test/health.test.js`: pruebas HTTP y fallo del driver real.

Las colecciones implementadas están en la tabla de la fase 4. Los pendientes de
pruebas de fotos y diagrama ER están en el checklist de semana 13. Un ping confirma
conectividad, pero no valida permisos de escritura ni la existencia de colecciones.

## Preparar MongoDB Atlas

1. Abre el proyecto de Atlas que contiene el clúster con `GymWeb`.
2. En **Security → Database Access**, elige **Add New Database User** y
   autenticación con contraseña. Este usuario de base de datos es distinto
   de la cuenta con la que entras a Atlas. Genera una contraseña segura.
3. En los permisos, usa **Specific Privileges / Add Specific Privilege**:
   rol `readWrite`, base `GymWeb`, todas las colecciones de esa base
   (campo de colección vacío si lo solicita). Evita `readWriteAnyDatabase`
   y permisos de administrador. Si Atlas permite restringir clústeres,
   selecciona únicamente el clúster de Gym. Guarda el usuario.
4. En **Security → Network Access → Add IP Address**, autoriza únicamente
   la IP pública de salida del equipo donde correrá Node. Para desarrollo
   local usa **Add Current IP Address** y, si procede, caducidad temporal.
   No uses `0.0.0.0/0`. Si cambias de red/IP, actualiza esta entrada. En un
   futuro despliegue se autorizará la IP de salida del servidor.
5. En el clúster, selecciona **Connect → Drivers**, elige **Node.js** y una
   versión compatible con el controlador 7 instalado. Copia la URI.
6. Introduce la URI solo en `backend/.env`, sustituyendo usuario y contraseña
   localmente. Codifica los caracteres especiales de ambos con percent-encoding
   (por ejemplo, `@` como `%40`). Conserva las opciones de Atlas de la URI.
   La aplicación selecciona `GymWeb` explícitamente mediante `MONGODB_DB`.

No pegues contraseñas ni URI reales en el chat, HTML, capturas, entregas o Git.
`.env` está excluido; `.env.example` está pensado para versionarse sin secretos.

Referencias oficiales:
[conexión a Atlas](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/),
[conexión con Drivers](https://www.mongodb.com/docs/atlas/driver-connection/).

## Ejecutar localmente (PowerShell)

Requisito: Node.js 22.13 o posterior compatible con MongoDB Driver 7.
Desde la raíz del proyecto:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
notepad .env
# Guarda MONGODB_URI en el editor local y ciérralo.
npm start
```

Copia `.env.example` solo la primera vez; no sobrescribas una configuración
existente. El servidor escucha por defecto en `127.0.0.1:3000`.
`npm run dev` reinicia al cambiar código; tras editar `.env`, reinicia el proceso.

En otra terminal:

```powershell
curl.exe -i http://127.0.0.1:3000/health
```

Con un ping exitoso devuelve **HTTP 200**:

```json
{"status":"ok","database":"connected"}
```

Sin URI, con credenciales incorrectas, sin IP autorizada o sin acceso a la DB
devuelve **HTTP 503**:

```json
{"status":"error","database":"unavailable"}
```

Cada petición ejecuta `ping` sobre `GymWeb` con tiempos de espera limitados por el driver.
El servidor HTTP puede iniciar aunque Atlas no esté disponible; eso no indica
que la base esté conectada. La respuesta no expone la URI ni errores internos.
Para diagnosticar 503, revisa localmente URI, usuario, permisos, IP autorizada,
estado del clúster y conectividad DNS/red. Detén el servidor con Ctrl+C.

Si las consultas SRV de Atlas fallan con `ECONNREFUSED` usando el DNS del
sistema, pero funcionan con Cloudflare, puedes agregar a `backend/.env`:

```dotenv
MONGODB_DNS_SERVERS=1.1.1.1,1.0.0.1
```

Reinicia el backend después del cambio. Esta opción configura las consultas DNS
solo del proceso Node; no cambia Windows. Dejarla vacía conserva el DNS del sistema.

## Validación actual

```powershell
cd backend
npm test
```

Las pruebas cubren salud, registro, autenticación, protección de rutas, perfil,
validación HTTP de fotos, esquema, índices, catálogo, membresías, reservas,
carrito y pedidos. Usan bases simuladas y MongoDB temporal; no requieren una cuenta
Atlas ni demuestran por sí solas la conectividad con ese servicio.
Para la evidencia de Atlas, configura `.env`, ejecuta el comando anterior de
`curl.exe` y conserva una captura del HTTP 200 y su JSON, sin mostrar secretos.
