// Convierte Z-Anatomy (FBX) en un GLB ligero: una malla por grupo muscular del visor.
// Requiere: npm i three@0.170.0 @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer@0.22
// en una carpeta aparte (no forma parte de la web). FBX de https://github.com/LluisV/Z-Anatomy (CC BY-SA 4.0).
// Uso: node convertir.mjs <MuscularSystem.fbx> <Regions.fbx> <salida.glb>
import { readFileSync } from "node:fs";
import * as THREE from "three";
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {} }), createElement: () => ({ style: {} }) };
const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
const BGU = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
const { Document, NodeIO } = await import("@gltf-transform/core");
const { EXTMeshoptCompression, KHRMeshQuantization } = await import("@gltf-transform/extensions");
const { weld, simplify, quantize, meshopt, prune, dedup } = await import("@gltf-transform/functions");
const { MeshoptSimplifier, MeshoptEncoder } = await import("meshoptimizer");

const [, , fbxMusculos, fbxRegiones, salida] = process.argv;
THREE.TextureLoader.prototype.load = () => new THREE.Texture();

const GRUPOS = [
    ["pectorales", /pectoralis_m(ajor|inor)/i],
    ["deltoides", /deltoid_muscle/i],
    ["biceps", /biceps_brachii|^brachialis_muscle/i],
    ["triceps", /triceps_brachii|^anconeus/i],
    ["antebrazos", /brachioradialis|carpi|^extensor_digitorum$|extensor_digiti_minimi$|palmaris_longus|pronator|^supinator|flexor_digitorum_(superficialis|profundus)|flexor_pollicis_longus|abductor_pollicis_longus|extensor_pollicis|extensor_indicis/i],
    ["abdominales", /rectus_abdominis|pyramidalis/i],
    ["oblicuos", /abdominal_oblique/i],
    ["trapecio", /trapezius|rhomboid/i],
    ["dorsales", /latissimus_dorsi|teres_major/i],
    ["lumbares", /iliocostalis_(lumborum|thoracis)|longissimus_thoracis|spinalis_thoracis|quadratus_lumborum/i],
    ["gluteos", /gluteus_(maximus|medius|minimus)/i],
    ["cuadriceps", /rectus_femoris|vastus_/i],
    ["isquiotibiales", /biceps_femoris|semitendinosus|semimembranosus/i],
    ["gemelos", /gastrocnemius|soleus|plantaris/i]
];
// Tejido no muscular y músculos profundos que nunca se ven desde fuera.
const EXCLUIR = /fascia|bursa|sheath|septum|retinacul|aponeurosis|ligament|cross_section|linea_alba|tract|tendon|tendinous|arch|ring|tarsus|trochlea|arytenoid|crico|thyro|pharyn|glossus|hyoid|digastric|^(superior|inferior|medial|lateral)_rectus|^(superior|inferior)_oblique_muscle|palpebrae|diaphragm|intercostal|transversus|coccyg|anal|levator_ani|pubo|rotatores|interspinales|intertransvers|levatores|pterygoid|psoas|iliacus|obturator|gemellus|quadratus_femoris|piriformis|subscapularis|multifidus|semispinalis|longus_c|capitis|subclavius|popliteus|tibialis_posterior|flexor_digitorum_longus|flexor_hallucis_longus|vastus_intermedius|gluteus_minimus|pectoralis_minor/i;

function cargar(ruta) {
    const b = readFileSync(ruta);
    const raiz = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "");
    raiz.updateMatrixWorld(true);
    return raiz;
}

// Geometría indexada en metros, solo con posición (las normales se recalculan tras simplificar).
function limpia(malla) {
    let g = malla.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().makeScale(.01, .01, .01).multiply(malla.matrixWorld));
    g = BGU.mergeVertices(g.index ? g.toNonIndexed() : g, 1e-5);
    return g;
}

const cubetas = new Map();
const agregar = (id, g) => (cubetas.get(id) || cubetas.set(id, []).get(id)).push(g);
const usados = {};
cargar(fbxMusculos).traverse((o) => {
    if (!o.isMesh || o.name.startsWith("(")) return;
    const base = o.name.replace(/[lrgj]$/, "");
    if (o.geometry.attributes.position.count < 60) return;
    const grupo = GRUPOS.find(([, re]) => re.test(base))?.[0];
    if (EXCLUIR.test(base)) return;
    agregar(grupo ?? "otros", limpia(o));
    (usados[grupo ?? "otros"] ||= new Set()).add(base);
});
cargar(fbxRegiones).traverse((o) => {
    if (o.isMesh && o.geometry.attributes.position.count > 100) agregar("piel", limpia(o));
});

// Proporción de triángulos que se conserva por grupo: los resaltables quedan con más detalle.
const RATIO = { otros: .16, piel: .2 };
const doc = new Document();
const buffer = doc.createBuffer();
const escena = doc.createScene("anatomia");
for (const [id, lista] of cubetas) {
    const g = BGU.mergeGeometries(lista, false);
    const prim = doc.createPrimitive()
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(g.attributes.position.array)).setBuffer(buffer))
        .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.index.array)).setBuffer(buffer));
    const nombre = id === "piel" ? "piel" : `musculo_${id}`;
    const mesh = doc.createMesh(nombre).addPrimitive(prim);
    mesh.setExtras({ ratio: RATIO[id] ?? .32 });
    escena.addChild(doc.createNode(nombre).setMesh(mesh).setExtras(id === "piel" ? {} : { musculo: id }));
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes()) {
    const { ratio } = mesh.getExtras();
    // Simplificación por malla con su propia proporción (simplify() global usaría una sola).
    const prim = mesh.listPrimitives()[0];
    const indices = prim.getIndices().getArray();
    const pos = prim.getAttribute("POSITION").getArray();
    if (indices.length < 60000) { mesh.setExtras({}); continue; }
    const objetivo = Math.floor(indices.length * ratio / 3) * 3;
    const [nuevos] = MeshoptSimplifier.simplify(indices, pos, 3, objetivo, .01, ["LockBorder"]);
    prim.getIndices().setArray(new Uint32Array(nuevos));
    mesh.setExtras({});
}
// Normales suaves recalculadas con three tras compactar.
for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(prim.getAttribute("POSITION").getArray(), 3));
    g.setIndex(new THREE.BufferAttribute(prim.getIndices().getArray(), 1));
    const compacta = BGU.mergeVertices(g.toNonIndexed(), 1e-5);
    compacta.computeVertexNormals();
    prim.getAttribute("POSITION").setArray(new Float32Array(compacta.attributes.position.array));
    prim.getIndices().setArray(new Uint32Array(compacta.index.array));
    prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(compacta.attributes.normal.array)).setBuffer(buffer));
}
doc.createExtension(KHRMeshQuantization);
await doc.transform(prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: "high" }));
await new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder }).write(salida, doc);

let tris = 0;
for (const m of doc.getRoot().listMeshes()) {
    const n = m.listPrimitives()[0].getIndices().getCount() / 3;
    tris += n;
    console.log(m.getName().padEnd(26), Math.round(n), "tri");
}
console.log("TOTAL", Math.round(tris), "tri");
for (const [k, v] of Object.entries(usados)) if (k !== "otros") console.log(k, [...v].join(", "));
