// Fusión de geometría estática: todas las mallas opacas que no se mueven y comparten material
// se unen en una sola malla. Con cientos de piezas, la escena pasa de miles de llamadas de dibujo
// a unas pocas decenas. No se fusionan: subárboles con `userData.dinamico`, raíces de fusión
// propias (`userData.raizFusion`, p. ej. el techo que se oculta), materiales transparentes o múltiples.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const ATRIBUTOS = ["position", "normal", "uv"];

function preparar(malla, aRaiz) {
    let g = malla.geometry.clone();
    for (const nombre of Object.keys(g.attributes)) if (!ATRIBUTOS.includes(nombre)) g.deleteAttribute(nombre);
    g.morphAttributes = {};
    g.clearGroups();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const nombre of ATRIBUTOS) {
        const a = g.attributes[nombre];
        // Atributos entrelazados o normalizados se convierten a Float32 simples para poder unirse.
        if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
            const plano = new Float32Array(a.count * a.itemSize);
            for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) plano[i * a.itemSize + k] = a.getComponent(i, k);
            g.setAttribute(nombre, new THREE.BufferAttribute(plano, a.itemSize));
        }
    }
    if (!g.index) {
        const n = g.attributes.position.count;
        const indices = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
        for (let i = 0; i < n; i++) indices[i] = i;
        g.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    const matriz = aRaiz.clone().multiply(malla.matrixWorld);
    g.applyMatrix4(matriz);
    // Una escala negativa invierte el sentido de los triángulos: se corrige el orden.
    if (matriz.determinant() < 0) {
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    }
    return g;
}

export function fusionarEstaticos(raiz) {
    raiz.updateMatrixWorld(true);
    const aRaiz = raiz.matrixWorld.clone().invert();
    const lotes = new Map();
    const visitar = (o) => {
        if (o !== raiz && (o.userData.dinamico || o.userData.raizFusion)) return;
        const apta = o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible && !Array.isArray(o.material)
            && !o.material.transparent && !o.userData.noFusionar && o.geometry.attributes.position;
        if (apta) {
            const clave = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
            if (!lotes.has(clave)) lotes.set(clave, []);
            lotes.get(clave).push(o);
        }
        for (const hijo of [...o.children]) visitar(hijo);
    };
    visitar(raiz);

    let antes = 0, despues = 0;
    for (const mallas of lotes.values()) {
        antes += mallas.length;
        if (mallas.length < 2) { despues++; continue; }
        const unida = mergeGeometries(mallas.map((m) => preparar(m, aRaiz)), false);
        if (!unida) { despues += mallas.length; continue; }
        const nueva = new THREE.Mesh(unida, mallas[0].material);
        nueva.castShadow = mallas[0].castShadow;
        nueva.receiveShadow = mallas[0].receiveShadow;
        nueva.name = `fusion_${mallas[0].material.name || mallas[0].material.type}`;
        raiz.add(nueva);
        for (const m of mallas) m.removeFromParent();
        despues++;
    }
    return { antes, despues };
}
