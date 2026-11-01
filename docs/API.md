# API de GymFlow

Contrato de las rutas implementadas en `backend/src/app.js`, `auth.js`, `api.js`
y `database.js`. El servidor Express sirve la web y la API desde el mismo origen.
La URL local predeterminada es `http://127.0.0.1:3000`.

## Convenciones

- Las entradas y respuestas son JSON, excepto la subida y descarga de fotos.
  Para enviar JSON, usar `Content-Type: application/json`; el límite del cuerpo es **8 KiB**.
- Los importes son números enteros en pesos colombianos (COP), sin formato monetario.
  Las fechas de respuesta se serializan como cadenas ISO 8601 en UTC.
- Los identificadores de catálogo son slugs de hasta 60 caracteres, con el patrón
  `^[a-z0-9]+(-[a-z0-9]+)*$`. Los IDs de usuarios, membresías, reservas, pedidos y
  archivos son cadenas que representan ObjectId de MongoDB.
- Los objetivos válidos son `fuerza`, `hipertrofia`, `resistencia` y `perdida-grasa`.
- Las listas se devuelven dentro de una propiedad con el nombre del recurso;
  por ejemplo, `{ "planes": [] }`. Una lista vacía es una respuesta exitosa.
- Las rutas **privadas** requieren la cookie de sesión `gym_session`.
  La aplicación identifica al usuario desde esa cookie, sin pedir su ID en el cuerpo.
- La tabla de cada grupo indica los errores propios de cada ruta. También se aplican
  los errores comunes descritos a continuación. Express atiende automáticamente
  `HEAD` en las rutas `GET`, con las mismas cabeceras y sin cuerpo.

## Errores y reglas comunes

Los errores de la API tienen normalmente esta forma:

```json
{ "message": "Descripción del problema." }
```

| Código | Significado y condiciones |
|---|---|
| `400` | Entrada inválida o JSON mal formado. |
| `401` | Falta la sesión, venció o no es válida en una ruta privada; también credenciales incorrectas al iniciar sesión. |
| `403` | En una escritura, si se envía `Origin`, debe coincidir con el protocolo y host del servidor. Las reservas también pueden devolverlo por falta de una membresía con entrenador. |
| `404` | Recurso no encontrado o ruta/método no implementado bajo `/api`. |
| `409` | Conflicto de negocio: correo repetido, reserva incompatible o stock insuficiente, según la ruta. |
| `413` | El JSON supera 8 KiB o la foto supera 2 MiB. |
| `415` | Los bytes del archivo subido no corresponden a un formato de foto admitido. |
| `429` | Límite de intentos de login o de operaciones concurrentes de autenticación/registro. |
| `500` | Error no controlado por los manejadores de las rutas: `{ "message": "Error interno." }`. |
| `503` | Fallo al consultar o escribir en MongoDB, al comprobar la sesión o al preparar el esquema/catálogo. Las rutas de negocio también convierten errores inesperados en este código. No se exponen errores internos ni credenciales. |

La comprobación de `Origin` se aplica a métodos distintos de `GET` y `HEAD` bajo
`/api`, incluidas las rutas públicas de registro, login y logout. Un cliente como
curl puede omitir esta cabecera; si la envía, debe usar el mismo origen.

Por defecto `/api` responde con `Cache-Control: no-store`. Los listados de planes,
entrenadores, máquinas y rutinas permiten caché pública durante 60 segundos.
La portada solicita sus catálogos con `cache: "no-store"` para reflejar cambios al
recargar. Las fotos tienen una política específica descrita en su sección.

## Salud del servicio

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `GET` | `/vivo` | Pública | Sin cuerpo ni parámetros. | `200` `{ "status": "ok" }`. | Ninguno previsto por la ruta. |
| `GET` | `/health` | Pública | Sin cuerpo ni parámetros. | `200` `{ "status": "ok", "database": "connected" }`. | `503` `{ "status": "error", "database": "unavailable" }`. |

`/vivo` comprueba que el proceso HTTP responde. `/health` ejecuta un ping a MongoDB
en cada petición; no comprueba todas las reglas de negocio ni los permisos de escritura.
Ambas respuestas usan `no-store`. Que la portada HTML abra no demuestra que MongoDB responda.

## Registro y sesiones

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `POST` | `/api/usuarios` | Pública | JSON con `nombre`, `correo`, `password`. | `201` `{ message, usuario: { id, nombre, correo } }`. | `400`, `409` correo repetido, `429`, `503`. |
| `POST` | `/api/login` | Pública | JSON con `correo`, `password`. | `200` `{ "message": "Sesión iniciada." }` y cabecera `Set-Cookie`. | `400`, `401` credenciales incorrectas, `429`, `503`. |
| `GET` | `/api/sesion` | Pública | Cookie opcional; sin cuerpo. | `200` `{ "usuario": { "nombre": "Ana" } }` o `{ "usuario": null }`. | No propaga fallos de MongoDB: también devuelve `200` con `usuario: null`. |
| `GET` | `/api/me` | Privada | Cookie; sin cuerpo. | `200` `{ usuario: { id, nombre, correo, rol, fotoUrl } }`. | `401`, `503`. |
| `POST` | `/api/logout` | Pública | Cookie opcional; sin cuerpo. | `200` `{ "message": "Sesión cerrada." }` y eliminación de la cookie. | `503`. |

Validaciones del registro: nombre recortado de 2 a 100 caracteres y sin caracteres
de control, correo válido de hasta 254 caracteres y contraseña de 8 a 128 caracteres.
El correo se recorta y pasa a minúsculas. El registro no inicia sesión automáticamente.
Las contraseñas se guardan como hash scrypt; nunca se devuelven.

El login normaliza el correo y valida su formato y la longitud de la contraseña.
Permite hasta 10 intentos por IP cada 15 minutos y hasta 4 verificaciones concurrentes;
el `429` incluye `Retry-After` en segundos. El registro limita a 4 operaciones
concurrentes y su `429` no incluye esa cabecera. Estos límites viven en memoria.

La sesión dura 8 horas. La cookie es `HttpOnly`, `SameSite=Strict`, `Path=/` y
`Secure` cuando el servidor reconoce HTTPS. MongoDB guarda el SHA-256 del token,
el usuario y la expiración; un índice TTL elimina sesiones vencidas y la API verifica
también la fecha. Un nuevo login invalida la sesión de la cookie anterior.
Logout funciona sin sesión; si tiene token, intenta eliminarlo de MongoDB.

`fotoUrl` puede ser `null`. `/api/sesion` sirve para mostrar la navegación pública;
su respuesta no sustituye a `/health` ni autoriza el acceso a rutas privadas.
La página `GET /micuenta.html` está protegida: sin sesión redirige con `302` a
`/login.html?volver=...`; las rutas privadas de la API responden `401` en JSON.

## Catálogo público

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `GET` | `/api/planes` | Pública | Sin cuerpo ni parámetros. | `200` `{ planes: Plan[] }`, solo activos, por `orden` ascendente. | `503`. |
| `GET` | `/api/entrenadores` | Pública | Sin cuerpo ni parámetros. | `200` `{ entrenadores: Entrenador[] }`, solo activos, por nombre. | `503`. |
| `GET` | `/api/entrenadores/:id/disponibilidad` | Pública | `id` slug y query obligatoria `fecha=AAAA-MM-DD`. | `200` `{ fecha, horarios: [{ hora, inicio, disponible }] }`. | `400` fecha inválida, `404` entrenador inválido/no disponible, `503`. |
| `GET` | `/api/productos` | Pública | Sin cuerpo ni parámetros. | `200` `{ productos: Producto[] }`, solo activos, por precio descendente. | `503`. |
| `GET` | `/api/maquinas` | Pública | Sin cuerpo ni parámetros. | `200` `{ maquinas: Maquina[] }`. | `503`. |
| `GET` | `/api/rutinas` | Pública | Query opcional `objetivo` del enum de objetivos. | `200` `{ rutinas: ResumenRutina[] }`, sin ejercicios. | `400` objetivo inválido, `503`. |
| `GET` | `/api/rutinas/:id` | Privada | `id` slug y cookie; sin cuerpo. | `200` `{ rutina: Rutina }`, con ejercicios. | `401`, `404`, `503`. |

Formas de los recursos (la notación con nombres de tipos describe campos; no es JSON literal):

| Recurso | Campos de respuesta |
|---|---|
| `Plan` | `id`, `nombre`, `descripcion`, `precioMensual`, `maxPersonas`, `incluyeEntrenador`, `beneficios` (cadenas), `orden`. |
| `Entrenador` | `id`, `nombre`, `especialidad`, `descripcion`, `imagen`, `zona`, `horario` (`[{ dia, horas }]`). El día ISO va de 1 = lunes a 7 = domingo; las horas son cadenas `HH:00`. |
| `Producto` | `id`, `nombre`, `descripcion`, `precio`, `imagen`, `categoria`, `stock`. Las categorías son `suplementos`, `accesorios`, `ropa`. |
| `Maquina` | `id`, `nombre`, `area`, `descripcion`, `ejercicio`, `pasos`, `musculos` (`principales`, `secundarios`). |
| `ResumenRutina` | `id`, `nombre`, `objetivo`, `nivel`, `descripcion`, `diasPorSemana`, `duracionMin`. |
| `Rutina` | Campos del resumen más `ejercicios`: `nombre`, `series`, `repeticiones`, `descansoSeg`, `musculos` y `maquinaId` opcional. Los niveles son `principiante`, `intermedio`, `avanzado`. |

La disponibilidad usa la hora de Cali/Bogotá (UTC−5). `hora` se muestra como `HH:MM`,
`inicio` lleva el instante ISO en UTC y `disponible` es booleano. Solo se listan
horas futuras a menos de 30 días; las ocupadas permanecen en la lista con `false`.
Si no hay horarios aplicables, devuelve `horarios: []`.

## Perfil y fotos (semana 13)

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `GET` | `/api/perfil` | Privada | Cookie; sin cuerpo. | `200` `{ perfil: Perfil }`. | `401`, `503`. |
| `PATCH` | `/api/perfil` | Privada | JSON con al menos uno de `nombre`, `telefono`, `objetivo`. | `200` `{ "message": "Perfil actualizado.", perfil: Perfil }`. | `400` cambios inválidos o sin campos admitidos, `401`, `503`. |
| `POST` | `/api/perfil/foto` | Privada | `multipart/form-data`, un solo archivo en el campo `foto`, sin campos adicionales. | `201` `{ "message": "Foto de perfil actualizada.", perfil: Perfil }`. | `400` archivo ausente/campo incorrecto/formulario inválido, `401`, `404` usuario desaparecido, `413`, `415`, `503`. |
| `DELETE` | `/api/perfil/foto` | Privada | Cookie; sin cuerpo. | `200` `{ "message": "Foto de perfil eliminada." }`, incluso si ya no tenía foto. | `401`, `503`. |
| `GET` | `/api/fotos/:id` | Pública | `id` del archivo: 24 caracteres hexadecimales en minúsculas; sin cuerpo. | `200` con los bytes de la imagen. | `404` ID inválido o archivo inexistente, `503` si falla la lectura inicial. |

`Perfil` contiene `id`, `nombre`, `correo`, `telefono`, `objetivo`, `fotoUrl`.
Cuando no hay teléfono u objetivo se devuelven cadenas vacías, y sin foto `fotoUrl`
es `null`. Si el usuario deja de existir entre la comprobación de sesión y la
consulta/actualización de perfil, las rutas JSON pueden devolver `perfil: null`.

En el PATCH, el nombre se recorta y debe medir de 2 a 100 caracteres. El teléfono
se recorta y debe cumplir `^\+?[0-9 ]{7,20}$` (dígitos y espacios, con `+` inicial
opcional). El objetivo debe pertenecer al enum común. Enviar `""` en teléfono u
objetivo elimina ese campo; enviar `""` en nombre es inválido. Otros campos no se
modifican, y un cuerpo sin ninguno de los tres campos admitidos responde `400`.

La foto puede ser **JPEG, PNG o WebP**, de hasta **2 MiB (2 097 152 bytes)**.
El servidor identifica el formato por la firma de sus bytes, no por la extensión
ni por el MIME declarado por el cliente. La subida utiliza Multer en memoria y
GridFS, bucket `fotos`; no guarda archivos en el directorio público del proyecto.
El navegador debe generar el `Content-Type` y boundary al enviar `FormData`.

Los metadatos se almacenan en `fotos.files`, los fragmentos en `fotos.chunks` y
`usuarios.foto` guarda `archivoId`, `url`, `tipo`, `tamano`, `subidaAt`.
Los metadatos del archivo incluyen `usuarioId` y `tipo`. Cada subida genera un ID
nuevo, actualiza la referencia del usuario e intenta borrar el archivo anterior.
DELETE retira la referencia e intenta borrar los datos de GridFS.

La descarga es pública para quien conoce la URL y devuelve `Content-Type` según
el formato detectado, `Content-Length` y `Cache-Control: public, max-age=31536000,
immutable`. Si falla el stream una vez iniciada la descarga, se corta la conexión;
en ese punto ya no se puede devolver un error JSON. Una copia descargada puede
seguir en la caché del navegador tras reemplazar o eliminar la foto.

## Membresías

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `GET` | `/api/membresia` | Privada | Cookie; sin cuerpo. | `200` `{ actual: Membresia o null, historial: Membresia[] }`, hasta 20 entradas recientes. | `401`, `503`. |
| `POST` | `/api/membresias` | Privada | JSON `{ "planId": "basico", "meses": 1 }`; meses numérico: `1`, `3`, `6` o `12`. | `201` `{ message, membresia: Membresia }`. | `400`, `401`, `404` plan no disponible, `503`. |
| `PATCH` | `/api/membresia` | Privada | JSON `{ "renovacionAutomatica": true }` o `false`, booleano. | `200` `{ message, membresia: Membresia }`. | `400`, `401`, `404` sin membresía activa, `503`. |

`Membresia` contiene `id`, `planId`, `plan` (copia de nombre, precio mensual,
inclusión de entrenador y máximo de personas), `meses`, `precioPagado`, `fechaInicio`,
`fechaFin`, `estado`, `renovacionAutomatica`, `pagos`, `createdAt` y `updatedAt`.
Cada pago contiene `referencia`, `monto`, `fecha`, `tipo` (`compra`, `extension`,
`renovacion`). El estado es `activa`, `vencida` o `reemplazada`.

Comprar el mismo plan amplía su vencimiento; comprar otro reemplaza la membresía
activa y comienza el nuevo periodo. Consultar o modificar la membresía puede
sincronizar su vencimiento y registrar una renovación simulada si está habilitada.
Los precios se obtienen del catálogo y los pagos son simulados.

## Reservas

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `GET` | `/api/reservas` | Privada | Cookie; sin cuerpo. | `200` `{ reservas: Reserva[] }`, hasta 50, por inicio descendente. | `401`, `503`. |
| `POST` | `/api/reservas` | Privada | JSON con `entrenadorId` (slug) e `inicio` (cadena de fecha de hasta 40 caracteres). Usar el ISO obtenido de disponibilidad. | `201` `{ "message": "Cita reservada.", reserva: Reserva }`. | `400` entrada/horario inválido, `401`, `403` sin plan con entrenador, `404` entrenador no disponible, `409` choque de horario o máximo de citas, `503`. |
| `DELETE` | `/api/reservas/:id` | Privada | ID de reserva y cookie; sin cuerpo. | `200` `{ "message": "Cita cancelada." }`. | `401`, `404` ID inválido, reserva ajena, cancelada, pasada o inexistente, `503`. |

Una cita dura 60 minutos, debe comenzar a la hora exacta, estar en el horario del
entrenador, ser futura y a no más de 30 días. Requiere una membresía activa que
incluya entrenador y permite hasta 4 citas futuras confirmadas por usuario.
Los índices únicos parciales evitan tanto ocupar dos veces al entrenador como
reservar dos citas del mismo usuario a la misma hora. DELETE cambia el estado a
`cancelada`; solo permite cancelar reservas futuras confirmadas del usuario actual.

`Reserva` contiene `id`, `entrenadorId`, `entrenador` (nombre), `inicio`, `fin` y
`estado` (`confirmada` o `cancelada`). El listado añade `imagen` del entrenador.

## Carrito y pedidos

| Método | Ruta | Acceso | Recibe | Respuesta exitosa | Errores propios |
|---|---|---|---|---|---|
| `GET` | `/api/carrito` | Privada | Cookie; sin cuerpo. | `200` `{ items: ItemCarrito[], total }`. | `401`, `503`. |
| `PUT` | `/api/carrito` | Privada | JSON `{ "items": [{ "productoId": "shaker", "cantidad": 2 }] }`. | `200` `{ items: ItemCarrito[], total }`. | `400` estructura/cantidades inválidas o productos inexistentes/inactivos, `401`, `503`. |
| `GET` | `/api/pedidos` | Privada | Cookie; sin cuerpo. | `200` `{ pedidos: Pedido[] }`, hasta 30, del más reciente al más antiguo. | `401`, `503`. |
| `POST` | `/api/pedidos` | Privada | Cookie; sin cuerpo. Compra el carrito guardado en la cuenta. | `201` `{ message, pedido: Pedido }`. | `400` carrito vacío, `401`, `409` stock insuficiente, `503`. |

PUT reemplaza el carrito completo: `items` admite hasta 30 entradas y cada cantidad
debe ser un entero de 1 a 20. `items: []` lo vacía. Si un producto está repetido,
se suman sus cantidades con un máximo de 20. Guardar el carrito no reserva stock.

`ItemCarrito` contiene `productoId`, `nombre`, `imagen`, `precio`, `stock`, `cantidad`
y `subtotal`. El servidor calcula precios y total usando el catálogo vigente;
los productos inactivos o eliminados no aparecen al leer el carrito.

`Pedido` contiene `id`, `items`, `total`, `estado`, `referencia` y `createdAt`.
Cada línea incluye `productoId`, `nombre`, `precioUnitario`, `cantidad`, `subtotal`.
La creación devuelve estado `pagado` y una referencia `GF-...` de compra simulada.
El esquema también admite `entregado` y `cancelado`, pero no se expone una ruta de
cambio de estado. La compra descuenta stock y vacía el carrito dentro de una
transacción; un conflicto de stock revierte la operación completa.

## Ejemplos de uso local

Desde la raíz del proyecto, iniciar una base temporal sin Atlas:

```powershell
cd backend
npm run dev:memoria
```

En otra terminal PowerShell, comprobar salud y catálogo:

```powershell
$base = 'http://127.0.0.1:3000'
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/api/planes"
```

Registrar una cuenta de prueba (usar un correo nuevo si ya existe), iniciar sesión
y consultar su perfil conservando las cookies:

```powershell
$registro = @{ nombre = 'Prueba API'; correo = 'prueba-api@example.com'; password = 'clave-de-prueba-123' } | ConvertTo-Json
Invoke-RestMethod "$base/api/usuarios" -Method Post -ContentType 'application/json' -Body $registro
$login = @{ correo = 'prueba-api@example.com'; password = 'clave-de-prueba-123' } | ConvertTo-Json
Invoke-RestMethod "$base/api/login" -Method Post -ContentType 'application/json' -Body $login -SessionVariable sesionGym
Invoke-RestMethod "$base/api/perfil" -WebSession $sesionGym
$cambios = @{ nombre = 'Prueba API editada'; telefono = '+57 300 123 4567'; objetivo = 'fuerza' } | ConvertTo-Json
Invoke-RestMethod "$base/api/perfil" -Method Patch -ContentType 'application/json' -Body $cambios -WebSession $sesionGym
Invoke-RestMethod "$base/api/logout" -Method Post -WebSession $sesionGym
```

Para probar la subida desde la interfaz: registrar/iniciar sesión, entrar a
`micuenta.html`, abrir **Editar perfil**, elegir una imagen y subirla. La solicitud
debe ser `POST /api/perfil/foto` con estado `201`; la URL de `fotoUrl` debe devolver
los bytes de la imagen con estado `200`.

Con Atlas, configurar `backend/.env` a partir de `.env.example` y usar `npm start`.
Sin `MONGODB_URI`, con credenciales inválidas o sin conectividad, `/health` y el
catálogo pueden responder `503`. `/api/sesion` puede seguir devolviendo `200`
con `usuario: null`; no demuestra conectividad. Ver [README del backend](../backend/README.md).
Al preparar la base se vuelve a sembrar el catálogo; para observar un cambio de
precio manual, mantener el servidor encendido y recargar solo el navegador.

## Comprobación automática

```powershell
cd backend
npm test
```

Las pruebas de integración usan un MongoDB temporal y las de autenticación/perfil
también emplean bases simuladas. El índice `fotos_por_usuario` se crea al preparar
el esquema y se comprueba su clave y la repetición idempotente de esa preparación.
Los pendientes de integración de las fotos y del modelo ER se detallan en
[semana13-pendientes.md](semana13-pendientes.md).
