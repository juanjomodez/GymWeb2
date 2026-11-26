# Diagrama ER de GymFlow

El esquema integrado en `main` define doce colecciones de aplicación, incluida `archivos`. GridFS usa dos colecciones adicionales para almacenar las fotos de perfil. [Ver esquema de MongoDB](https://github.com/juanjomodez/GymWeb2/blob/main/backend/src/esquema.js)

```mermaid
erDiagram
    usuarios ||--o{ sesiones : userId
    usuarios ||--o{ membresias : usuarioId
    planes ||--o{ membresias : planId
    usuarios ||--o{ reservas : usuarioId
    entrenadores ||--o{ reservas : entrenadorId
    usuarios ||--o| carritos : "_id compartido"
    usuarios ||--o{ pedidos : usuarioId
    carritos }o--o{ productos : "items[].productoId"
    pedidos }o--o{ productos : "items[].productoId"
    rutinas }o--o{ maquinas : "ejercicios[].maquinaId"
    usuarios ||--o{ archivos : autor
    membresias o|--o{ archivos : "pagos[].referencia"
    reservas o|--o| archivos : "_id como texto"
    pedidos o|--o| archivos : referencia
    archivos o|--o| FOTOS_FILES : "ruta de la foto"
    usuarios ||--o{ FOTOS_FILES : "metadata.usuarioId"
    usuarios o|--o| FOTOS_FILES : "foto.archivoId"
    FOTOS_FILES ||--o{ FOTOS_CHUNKS : files_id

    usuarios {
        objectId _id PK
        string correo UK
        string nombre
        string passwordHash
        string rol
        object foto
    }
    sesiones {
        string _id PK "hash del token"
        objectId userId FK "admite string por compatibilidad"
        date expiresAt
    }
    planes {
        string _id PK
        string nombre
        int precioMensual
        boolean incluyeEntrenador
    }
    membresias {
        objectId _id PK
        objectId usuarioId FK
        string planId FK
        object plan "datos del plan al comprar"
        array pagos
        date fechaInicio
        date fechaFin
        string estado
        boolean renovacionAutomatica
    }
    entrenadores {
        string _id PK
        string nombre
        array horario
    }
    reservas {
        objectId _id PK
        objectId usuarioId FK
        string entrenadorId FK
        date inicio
        date fin
        string estado
    }
    rutinas {
        string _id PK
        string nombre
        string objetivo
        array ejercicios "maquinaId opcional"
    }
    maquinas {
        string _id PK
        string nombre
        string area
        object musculos
    }
    productos {
        string _id PK
        string nombre
        int precio
        int stock
    }
    carritos {
        objectId _id PK, FK "igual a usuarios._id"
        array items "productoId y cantidad"
        date updatedAt
    }
    pedidos {
        objectId _id PK
        objectId usuarioId FK
        array items "incluye datos de compra"
        int total
        string referencia UK
        string estado
    }
    archivos {
        objectId _id PK
        string nombre UK "UUID con extensión"
        string titulo
        string tipo "MIME"
        int peso "bytes"
        string ruta "relativa al almacenamiento"
        string almacen "disco o gridfs"
        date fecha
        objectId autor FK
        string modulo "membresias, reservas, pedidos o perfil"
        string operacion
        string sha256
        object datos "opcional, para regenerar el PDF"
    }
    FOTOS_FILES["fotos.files"] {
        objectId _id PK
        object metadata "usuarioId y tipo"
        string filename
        number length
        date uploadDate
    }
    FOTOS_CHUNKS["fotos.chunks"] {
        objectId _id PK
        objectId files_id FK
        int n
        binary data
    }
```

Las referencias marcadas como `FK` son relaciones lógicas de MongoDB.
Cada membresía guarda sus pagos y datos del plan como subdocumentos.
Las rutinas guardan los ejercicios dentro del documento y los pedidos
conservan el nombre y precio de los productos al comprar. Una foto vigente
se identifica mediante `usuarios.foto.archivoId`. GridFS registra el dueño
en `fotos.files.metadata.usuarioId`.

`archivos` registra los metadatos de los comprobantes en PDF y las fotos de
perfil. Los PDF se guardan en disco y las fotos en GridFS. El par
`(modulo, operacion)` es único y limita a un archivo por operación. En
membresías, `operacion` es la referencia de cada pago. En reservas, es el
`_id` convertido a texto. En pedidos, es la referencia del pedido. Para
una foto de perfil, `ruta` tiene la forma `fotos/<id>` y apunta a
`fotos.files._id`.
