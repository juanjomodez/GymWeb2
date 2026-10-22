# Créditos de recursos

| Recurso | Archivo(s) | Fuente | Licencia |
|---|---|---|---|
| HDRI "Gym 01" (reflejos del entorno) | `hdri/gimnasio_1k.hdr` | [Poly Haven](https://polyhaven.com/a/gym_01) | CC0 |
| Rubber Tiles | `texturas/caucho_*` | [Poly Haven](https://polyhaven.com/a/rubber_tiles) | CC0 |
| Painted Concrete | `texturas/concreto_*` | [Poly Haven](https://polyhaven.com/a/painted_concrete) | CC0 |
| Wood Floor | `texturas/madera_*` | [Poly Haven](https://polyhaven.com/a/wood_floor) | CC0 |
| Rubberized Track | `texturas/pista_*` | [Poly Haven](https://polyhaven.com/a/rubberized_track) | CC0 |
| Fabric Leather 02 | `texturas/cuero_*` | [Poly Haven](https://polyhaven.com/a/fabric_leather_02) | CC0 |
| Metal Plate | `texturas/metal_*` | [Poly Haven](https://polyhaven.com/a/metal_plate) | CC0 |
| Fuente Anton | `fuentes/anton.json` (convertida al formato typeface de Three.js) | [Google Fonts](https://fonts.google.com/specimen/Anton) | SIL OFL 1.1 (`fuentes/OFL-Anton.txt`) |

Las texturas se redujeron a 1024/512 px. Los mapas `_arm` empaquetan oclusión (R), rugosidad (G) y metalicidad (B).

| Recurso | Archivo(s) | Fuente | Licencia |
|---|---|---|---|
| Z-Anatomy: sistema muscular y regiones del cuerpo | `modelos/anatomia.glb` (agrupado en 14 grupos musculares, simplificado y comprimido con `herramientas/convertir-anatomia.mjs`) | [Z-Anatomy](https://github.com/LluisV/Z-Anatomy) (`MuscularSystem100.fbx`, `Regions of human body100.fbx`) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): el GLB derivado se distribuye bajo la misma licencia |
| Poly Haven: potted_plant_02, potted_plant_04, planter_box_01, old_tyre, wall_clock, WetFloorSign_01, standing_chalkboard_01, sofa_02, modern_arm_chair_01, security_camera_01, metal_trash_can, hanging_industrial_lamp | `modelos/props.glb` (unidos, texturas WebP de 256–512 px y compresión meshopt con `herramientas/empaquetar-props.mjs`) | [Poly Haven](https://polyhaven.com/models) | CC0 |
