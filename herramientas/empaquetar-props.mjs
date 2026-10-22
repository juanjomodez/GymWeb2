// Empaqueta modelos CC0 de Poly Haven (glTF 1k) en un solo GLB ligero para la web.
// Uso: node empaquetar-props.mjs <carpeta-descargas> <salida.glb>
// Cada modelo queda como un nodo raíz con su id (p. ej. "old_tyre"), en metros y con base en y = 0.
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { NodeIO, Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { mergeDocuments, dedup, prune, weld, simplify, textureCompress, quantize, meshopt, flatten, join, getBounds } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const [, , carpeta, salida] = process.argv;
// Tamaño máximo de textura por modelo: los pequeños o lejanos usan menos.
const TEXTURA = { wall_clock: 256, WetFloorSign_01: 256, security_camera_01: 256, metal_trash_can: 256, hanging_industrial_lamp: 256 };
// Proporción de triángulos conservada (las plantas vienen muy densas).
const RATIO = { potted_plant_01: .25, potted_plant_02: .3 };

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const final = new Document();

for (const id of readdirSync(carpeta)) {
    const gltf = readdirSync(path.join(carpeta, id)).find((f) => f.endsWith(".gltf"));
    if (!gltf) continue;
    const doc = await io.read(path.join(carpeta, id, gltf));
    await doc.transform(
        weld(),
        simplify({ simplifier: MeshoptSimplifier, ratio: RATIO[id] ?? 1, error: .001 }),
        textureCompress({ encoder: sharp, targetFormat: "webp", quality: 82, resize: [TEXTURA[id] ?? 512, TEXTURA[id] ?? 512] })
    );
    // Agrupa todo el modelo bajo un nodo con su id y apoya la base en el piso.
    const escena = doc.getRoot().listScenes()[0];
    const raiz = doc.createNode(id);
    for (const hijo of escena.listChildren()) {
        escena.removeChild(hijo);
        raiz.addChild(hijo);
    }
    escena.addChild(raiz);
    const caja = getBounds(escena);
    raiz.setTranslation([-(caja.min[0] + caja.max[0]) / 2, -caja.min[1], -(caja.min[2] + caja.max[2]) / 2]);
    const envoltura = doc.createNode(`${id}_base`);
    escena.removeChild(raiz);
    envoltura.addChild(raiz);
    escena.addChild(envoltura);
    console.log(id.padEnd(26), caja.max.map((v, i) => (v - caja.min[i]).toFixed(2)).join(" × "), "m");
    mergeDocuments(final, doc);
}

// Una sola escena con todos los modelos; cada `<id>_base` es un nodo raíz.
const escenas = final.getRoot().listScenes();
const principal = escenas[0];
for (const extra of escenas.slice(1)) {
    for (const n of extra.listChildren()) principal.addChild(n);
    extra.dispose();
}
final.getRoot().setDefaultScene(principal);
const buffer = final.getRoot().listBuffers()[0];
for (const b of final.getRoot().listBuffers().slice(1)) {
    for (const a of final.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffer);
    b.dispose();
}
await final.transform(dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await io.write(salida, final);
void flatten; void join; void existsSync;
