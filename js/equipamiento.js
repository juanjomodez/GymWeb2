// Equipos adicionales y mobiliario del gimnasio, con la misma geometría procedural de modelos.js.
// Convención: el usuario se ubica hacia +z de cada equipo; la pila de pesas o la consola quedan hacia −z.
// Los objetos con piezas que se mueven marcan `userData.dinamico` para no fusionarse (ver fusionar.js).
import * as THREE from "three";
import * as T from "./texturas.js";
import { materiales, malla, grupo, caja, viga, barra, tubo, disco, barraOlimpica, mancuerna } from "./modelos.js";

let cache;
// Materiales propios de estos equipos, compartidos entre todas las copias para que se puedan fusionar.
function propios() {
    cache ??= {
        panel: new THREE.MeshStandardMaterial({ map: T.panelMarca(), roughness: .5, metalness: .3 }),
        locker: new THREE.MeshStandardMaterial({ map: T.puertaLocker(), roughness: .55, metalness: .45 }),
        vidrio: new THREE.MeshPhysicalMaterial({ color: 0x9fb3c2, roughness: .05, metalness: 0, transmission: 0, transparent: true, opacity: .22, depthWrite: false }),
        pantallaApagada: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: .15, metalness: .4 }),
        balonAzul: new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: .7 }),
        balonVerde: new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: .7 }),
        balonAmarillo: new THREE.MeshStandardMaterial({ color: 0xc79a14, roughness: .7 }),
        botellaAzul: new THREE.MeshPhysicalMaterial({ color: 0x2b6cd6, roughness: .15, clearcoat: 1 }),
        botellaNaranja: new THREE.MeshPhysicalMaterial({ color: 0xe6731d, roughness: .15, clearcoat: 1 }),
        toalla: new THREE.MeshStandardMaterial({ color: 0xe9e6e1, roughness: 1 }),
        madera: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: .7 })
    };
    return cache;
}

const geoCache = new Map();
const geo = (clave, crear) => {
    if (!geoCache.has(clave)) geoCache.set(clave, crear());
    return geoCache.get(clave);
};

// Pantalla emisiva con el estilo de las consolas (texto en 3 líneas).
export function pantallaPlana(ancho, alto, lineas) {
    return new THREE.Mesh(
        new THREE.PlaneGeometry(ancho, alto),
        new THREE.MeshBasicMaterial({ map: T.pantalla(lineas), toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) })
    );
}

// ---------- pila de pesas selectorizada (reutilizada por las máquinas guiadas) ----------
export function torrePesas({ alto = 2, placas = 14 } = {}) {
    const M = materiales();
    const P = propios();
    const g = grupo();
    g.add(caja(.66, .06, .5, M.acero, 0, .03, 0, .01));
    for (let i = 0; i < placas; i++) g.add(caja(.44, .041, .22, i === placas - 1 ? M.rojo : M.hierro, 0, .1 + i * .046, 0, .006));
    for (const x of [-.16, .16]) g.add(barra([x, .06, 0], [x, alto - .06, 0], .011, M.cromo, 12));
    g.add(barra([0, .1, 0], [0, .1 + placas * .046 + .3, 0], .01, M.cromo, 10));
    g.add(barra([.2, .1 + 5 * .046, .1], [.26, .1 + 5 * .046, .1], .008, M.rojo, 8));
    for (const x of [-.29, .29]) g.add(caja(.022, alto - .12, .36, P.panel, x, alto / 2, 0, .008));
    g.add(caja(.62, .07, .38, M.acero, 0, alto - .035, 0, .01));
    return g;
}

// ---------- máquinas guiadas ----------
export function multipower() {
    const M = materiales();
    const g = grupo();
    const W = 2.1, D = 1.3, H = 2.35, s = .08, guia = .6;
    for (const x of [-W / 2, W / 2]) {
        for (const z of [-D / 2, D / 2]) g.add(viga([x, 0, z], [x, H, z], s, M.acero));
        g.add(viga([x, .04, -D / 2 - .1], [x, .04, D / 2 + .1], s, M.acero));
        g.add(viga([x, H - .04, -D / 2], [x, H - .04, D / 2], s, M.acero));
        g.add(viga([x, .04, 0], [Math.sign(x) * guia, .04, 0], .06, M.acero));
        g.add(viga([x, H - .04, 0], [Math.sign(x) * guia, H - .04, 0], .06, M.acero));
        g.add(barra([Math.sign(x) * guia, .06, 0], [Math.sign(x) * guia, H - .08, 0], .019, M.cromo, 16));
        g.add(viga([x * .86, .7, -D / 2], [x * .86, .7, D / 2], .05, M.rojo));
        // Cuernos para guardar discos
        g.add(barra([x, .45, -D / 2], [x * 1.22, .45, -D / 2], .025, M.cromo, 14));
        const d = disco({ R: .225, t: .055, rojo: x < 0 });
        d.position.set(x * 1.19, .45, -D / 2);
        g.add(d);
    }
    for (const z of [-D / 2, D / 2]) g.add(viga([-W / 2, H - .04, z], [W / 2, H - .04, z], s, M.acero));
    g.add(viga([-W / 2, .04, -D / 2], [W / 2, .04, -D / 2], s, M.acero));
    const y = 1.28;
    for (const x of [-guia, guia]) {
        g.add(caja(.12, .2, .1, M.acero, x, y, 0, .015));
        g.add(caja(.05, .07, .12, M.rojo, x, y - .06, .07, .008));
    }
    const b = barraOlimpica([{ rojo: true }, { R: .2, t: .04 }]);
    b.position.set(0, y, 0);
    g.add(b);
    return g;
}

export function poleaCruzada() {
    const M = materiales();
    const g = grupo();
    for (const lado of [-1, 1]) {
        const torre = torrePesas({ alto: 2.3 });
        torre.position.set(lado * 1.6, 0, -.15);
        g.add(torre);
        const x = lado * 1.18;
        g.add(viga([x, 0, .14], [x, 2.3, .14], .09, M.acero));
        g.add(viga([lado * 1.6, .04, .14], [x, .04, .14], .07, M.acero));
        g.add(viga([lado * 1.6, .04, -.5], [lado * 1.6, .04, .5], .08, M.acero));
        g.add(barra([x, .12, .21], [x, 2.2, .21], .014, M.cromo, 12));
        for (let i = 0; i < 14; i++) g.add(caja(.03, .012, .02, M.ledBlanco, x, .3 + i * .13, .2, .003));
        g.add(caja(.11, .17, .11, M.rojo, x, 1.75, .27, .015));
        g.add(malla(geo("polea", () => new THREE.TorusGeometry(.045, .012, 10, 28)), M.aluminio, x, 1.65, .33));
        g.add(barra([x, 1.62, .34], [x - lado * .04, 1.3, .44], .005, M.caucho, 6));
        g.add(tubo([[x - lado * .12, 1.24, .46], [x - lado * .06, 1.3, .45], [x, 1.24, .46]], .014, M.caucho, 12));
        g.add(viga([lado * 1.6, 2.33, -.15], [x, 2.33, .14], .08, M.acero));
    }
    g.add(viga([-1.18, 2.33, .14], [1.18, 2.33, .14], .09, M.acero));
    g.add(barra([-.85, 2.18, .42], [.85, 2.18, .42], .018, M.cromoMoleteado, 16));
    for (const x of [-.85, .85]) g.add(viga([x, 2.3, .14], [x, 2.18, .42], .05, M.acero));
    return g;
}

export function extensionPiernas() {
    const M = materiales();
    const g = grupo();
    g.add(viga([0, .04, -.95], [0, .04, .45], .09, M.acero));
    g.add(viga([-.35, .04, .45], [.35, .04, .45], .08, M.acero));
    g.add(viga([0, .04, 0], [0, .45, 0], .08, M.acero));
    g.add(caja(.5, .08, .48, M.tapiz, 0, .5, 0, .03));
    const respaldo = caja(.5, .66, .08, M.tapiz, 0, .9, -.27, .03);
    respaldo.rotation.x = -.14;
    g.add(respaldo);
    g.add(viga([0, .45, -.12], [0, .82, -.34], .07, M.acero));
    g.add(caja(.07, .07, .07, M.rojo, .3, .52, .26, .012));
    g.add(viga([.3, .52, .26], [.3, .28, .4], .05, M.acero));
    g.add(barra([-.24, .28, .4], [.3, .28, .4], .014, M.cromo, 12));
    for (const x of [-.12, .12]) g.add(malla(geo("rodillo", () => new THREE.CylinderGeometry(.06, .06, .22, 24)), M.tapiz, x, .28, .4, 0, 0, Math.PI / 2));
    for (const x of [-.31, .31]) {
        g.add(viga([x, .44, -.04], [x, .52, -.04], .04, M.acero));
        g.add(barra([x, .52, -.06], [x, .52, .22], .016, M.caucho, 12));
    }
    const torre = torrePesas({ alto: 1.7, placas: 12 });
    torre.position.set(0, 0, -1.05);
    g.add(torre);
    return g;
}

export function pressPecho() {
    const M = materiales();
    const g = grupo();
    g.add(viga([0, .04, -1.0], [0, .04, .35], .09, M.acero));
    g.add(viga([-.38, .04, .35], [.38, .04, .35], .08, M.acero));
    g.add(viga([0, .04, .05], [0, .44, .05], .08, M.acero));
    g.add(caja(.46, .08, .42, M.tapiz, 0, .48, .1, .03));
    g.add(caja(.48, .82, .08, M.tapiz, 0, .98, -.2, .03));
    g.add(viga([0, .44, -.2], [0, 1.55, -.32], .08, M.acero));
    g.add(viga([-.42, 1.62, -.32], [.42, 1.62, -.32], .07, M.acero));
    for (const lado of [-1, 1]) {
        g.add(caja(.08, .08, .08, M.rojo, lado * .42, 1.62, -.32, .012));
        g.add(tubo([[lado * .42, 1.6, -.3], [lado * .46, 1.45, -.05], [lado * .42, 1.25, .2]], .022, M.acero, 16));
        g.add(barra([lado * .42, 1.08, .22], [lado * .42, 1.32, .22], .017, M.caucho, 12));
    }
    const torre = torrePesas({ alto: 2 });
    torre.position.set(0, 0, -1.05);
    g.add(torre);
    return g;
}

// ---------- peso libre ----------
export function bancoAjustable(inclinacion = .55) {
    const M = materiales();
    const g = grupo();
    g.add(viga([0, .1, -.62], [0, .1, .55], .07, M.acero));
    g.add(viga([-.24, .04, .55], [.24, .04, .55], .06, M.acero));
    g.add(viga([-.22, .04, -.62], [.22, .04, -.62], .06, M.acero));
    for (const x of [-.25, .25]) g.add(malla(geo("rueda", () => new THREE.CylinderGeometry(.045, .045, .03, 20)), M.caucho, x, .045, -.66, 0, 0, Math.PI / 2));
    g.add(viga([0, .1, .3], [0, .42, .3], .06, M.acero));
    g.add(caja(.3, .07, .36, M.tapiz, 0, .45, .32, .03));
    const largo = .86;
    const respaldo = caja(.28, .07, largo, M.tapiz, 0, 0, 0, .03);
    respaldo.position.set(0, .46 + Math.sin(inclinacion) * largo / 2, .12 - Math.cos(inclinacion) * largo / 2);
    respaldo.rotation.x = inclinacion;
    g.add(respaldo);
    g.add(viga([0, .1, -.4], [0, .46 + Math.sin(inclinacion) * largo * .55, .12 - Math.cos(inclinacion) * largo * .55], .05, M.acero));
    g.add(barra([0, .1, -.62], [0, .26, -.82], .014, M.caucho, 10));
    return g;
}

export function soporteBarras() {
    const M = materiales();
    const g = grupo(
        malla(new THREE.CylinderGeometry(.34, .36, .08, 32), M.acero, 0, .04, 0),
        malla(new THREE.CylinderGeometry(.26, .26, .3, 32, 1, true), M.acero, 0, .23, 0)
    );
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const x = Math.cos(a) * .19, z = Math.sin(a) * .19;
        g.add(barra([x, .08, z], [x, .5, z], .025, M.cromo, 14));
        g.add(barra([x, .5, z], [x, 1.8, z], .014, M.cromoMoleteado, 12));
        g.add(barra([x, 1.8, z], [x, 2.22, z], .025, M.cromo, 14));
    }
    return g;
}

// Discos apoyados contra un muro (eje sobre X, ligeramente inclinados).
export function discosApoyados(cantidad = 4) {
    const g = grupo();
    for (let i = 0; i < cantidad; i++) {
        const d = disco({ R: i % 2 ? .2 : .225, t: .055, rojo: i % 3 === 0 });
        d.rotation.set(0, Math.PI / 2, -.12);
        d.position.set(0, i % 2 ? .2 : .225, i * .07);
        g.add(d);
    }
    return g;
}

// Par de mancuernas en el piso, con una toalla y una botella.
export function puestoMancuernas() {
    const P = propios();
    const g = grupo();
    for (const z of [-.12, .12]) {
        const m = mancuerna({ radio: .07, ancho: .06, banda: z > 0 });
        m.position.set(0, .061, z);
        g.add(m);
    }
    g.add(caja(.32, .02, .22, P.toalla, .4, .01, 0, .008));
    g.add(malla(geo("botella", () => new THREE.CylinderGeometry(.036, .036, .22, 18)), P.botellaAzul, -.35, .11, .1));
    return g;
}

// ---------- cardio ----------
export function remo() {
    const M = materiales();
    const g = grupo();
    g.add(caja(.12, .05, 1.85, M.aluminio, 0, .4, .35, .012));
    g.add(viga([0, 0, 1.25], [0, .38, 1.25], .06, M.acero));
    g.add(viga([-.26, .03, 1.25], [.26, .03, 1.25], .06, M.acero));
    g.add(malla(geo("volanteRemo", () => new THREE.CylinderGeometry(.27, .27, .3, 40)), M.plastico, 0, .42, -.78, 0, 0, Math.PI / 2));
    g.add(malla(geo("aroRemo", () => new THREE.TorusGeometry(.27, .012, 8, 48)), M.rojo, .152, .42, -.78, 0, Math.PI / 2, 0));
    g.add(viga([-.3, .03, -.85], [.3, .03, -.85], .07, M.acero));
    g.add(viga([0, .38, -.5], [0, .42, -.66], .1, M.plastico));
    g.add(caja(.32, .06, .28, M.tapiz, 0, .47, .45, .02));
    for (const x of [-.1, .1]) {
        const pie = caja(.12, .02, .26, M.plastico, x, .52, -.33, .006);
        pie.rotation.x = -.8;
        g.add(pie);
    }
    g.add(viga([0, .55, -.62], [0, 1.0, -.42], .035, M.plastico));
    const monitor = caja(.22, .16, .04, M.plastico, 0, 1.04, -.4, .01);
    monitor.rotation.x = -.35;
    const p = pantallaPlana(.18, .12, ["500 M", "1:52", "ritmo / 500 m"]);
    p.position.z = .022;
    monitor.add(p);
    g.add(monitor);
    g.add(barra([-.26, .62, -.5], [.26, .62, -.5], .016, M.caucho, 10));
    return g;
}

export function eliptica() {
    const M = materiales();
    const g = grupo();
    g.add(caja(.62, .12, 1.7, M.plastico, 0, .1, 0, .04));
    g.add(caja(.63, .02, 1.71, M.rojo, 0, .17, 0, .006));
    g.add(caja(.5, .5, .4, M.plastico, 0, .4, .7, .08));
    g.add(viga([0, .16, -.7], [0, 1.25, -.55], .08, M.plastico));
    const consola = caja(.42, .26, .08, M.plastico, 0, 1.32, -.52, .03);
    consola.rotation.x = -.5;
    const p = pantallaPlana(.32, .17, ["ELÍPTICA", "312", "kcal · nivel 9"]);
    p.position.z = .042;
    consola.add(p);
    g.add(consola);
    // Brazos y pedales que se mueven en vaivén.
    const partes = [-1, 1].map((lado) => {
        const brazo = grupo(barra([0, 0, 0], [0, 1.0, -.08], .022, M.aluminio, 12), barra([0, 1.0, -.08], [0, 1.18, -.04], .02, M.caucho, 12));
        brazo.position.set(lado * .33, .5, -.55);
        const pedal = grupo(caja(.14, .03, .36, M.caucho, 0, 0, 0, .01), viga([0, -.02, -.18], [0, .3, -.6], .04, M.aluminio));
        pedal.position.set(lado * .16, .34, .1);
        g.add(brazo, pedal);
        return { brazo, pedal, lado };
    });
    g.userData.dinamico = true;
    let t = Math.random() * 6;
    g.userData.animar = (dt) => {
        t += dt * 3.2;
        for (const { brazo, pedal, lado } of partes) {
            const f = Math.sin(t + (lado > 0 ? Math.PI : 0));
            brazo.rotation.x = f * .28;
            pedal.position.z = .1 + f * .18;
            pedal.position.y = .34 + Math.cos(t + (lado > 0 ? Math.PI : 0)) * .06;
        }
    };
    return g;
}

// ---------- funcional ----------
export function rigFuncional(largo = 6) {
    const M = materiales();
    const g = grupo();
    const H = 2.75, D = 1.3;
    const columnas = [];
    for (let x = -largo / 2; x <= largo / 2 + .01; x += largo / 4) columnas.push(x);
    for (const x of columnas) {
        for (const z of [0, D]) g.add(caja(.075, H, .075, M.aceroPerforado, x, H / 2, z, .01));
        g.add(viga([x, .04, -.15], [x, .04, D + .15], .075, M.acero));
        g.add(barra([x, H - .12, 0], [x, H - .12, D], .016, M.cromoMoleteado, 14));
    }
    for (const z of [0, D]) g.add(viga([-largo / 2, H - .04, z], [largo / 2, H - .04, z], .075, M.acero));
    // Argollas colgando en el primer tramo
    for (const x of [-largo / 2 + .5, -largo / 2 + 1]) {
        g.add(barra([x, H - .08, D], [x, 1.9, D], .012, M.caucho, 6));
        g.add(malla(geo("argolla", () => new THREE.TorusGeometry(.12, .016, 10, 36)), propios().madera, x, 1.78, D, 0, Math.PI / 2, 0));
    }
    // Barra de dominadas con agarres paralelos y blancos para balón medicinal
    for (const x of [largo / 4 + .3, largo / 4 + .7]) g.add(barra([x, H - .32, D - .2], [x, H - .32, D + .2], .016, M.cromo, 10));
    g.add(caja(.6, .6, .04, M.rojo, largo / 2 - .7, 3.1, D, .02));
    g.add(caja(.45, .45, .05, M.caucho, largo / 2 - .7, 3.1, D + .01, .02));
    for (const x of columnas.slice(1, -1)) {
        g.add(caja(.09, .06, .13, M.rojo, x, 1.4, D + .09, .012));
    }
    return g;
}

export function trineo() {
    const M = materiales();
    const g = grupo();
    for (const x of [-.32, .32]) g.add(caja(.08, .04, 1.0, M.acero, x, .02, 0, .015));
    g.add(caja(.72, .03, .5, M.aceroPerforado, 0, .05, 0, .008));
    g.add(barra([0, .06, 0], [0, .42, 0], .025, M.cromo, 14));
    for (let i = 0; i < 3; i++) {
        const d = disco({ R: .225, t: .055, rojo: i === 1 });
        d.rotation.z = Math.PI / 2;
        d.position.y = .095 + i * .058;
        g.add(d);
    }
    for (const x of [-.25, .25]) g.add(barra([x, .05, .4], [x * 1.1, 1.05, .62], .02, M.acero, 10));
    g.add(barra([-.3, 1.05, .62], [.3, 1.05, .62], .018, M.caucho, 10));
    return g;
}

export function zonaEstiramiento() {
    const M = materiales();
    const g = grupo();
    for (let i = 0; i < 4; i++) g.add(caja(.62, .02, 1.8, i % 2 ? M.cauchoRojo : M.espuma, i * .72, .01, 0, .008));
    for (let i = 0; i < 4; i++) {
        g.add(malla(geo("rodilloEspuma", () => new THREE.CylinderGeometry(.075, .075, .9, 24)), M.espuma, -.7, .075, -.6 + i * .2, 0, 0, Math.PI / 2));
    }
    // Esterillas enrolladas en un estante
    g.add(caja(.06, .9, .4, M.acero, -1.1, .45, .4, .01));
    for (let i = 0; i < 5; i++) {
        g.add(malla(geo("esterilla", () => new THREE.CylinderGeometry(.06, .06, .6, 18)), i % 2 ? M.cauchoRojo : M.espuma, -1.45, .1 + i * .13, .4, 0, 0, Math.PI / 2));
    }
    return g;
}

export function rackBalones() {
    const M = materiales();
    const P = propios();
    const g = grupo();
    for (const x of [-.7, .7]) g.add(viga([x, 0, 0], [x, 1.2, -.12], .06, M.acero));
    const colores = [P.balonAzul, M.caucho, P.balonVerde, M.cauchoRojo, P.balonAmarillo, M.caucho];
    [.25, .7].forEach((y, fila) => {
        g.add(viga([-.7, y, .05 - fila * .05], [.7, y, .05 - fila * .05], .045, M.acero));
        for (let i = 0; i < 4; i++) {
            const r = .15 - fila * .02;
            g.add(malla(geo(`balon${r}`, () => new THREE.SphereGeometry(r, 28, 18)), colores[(i + fila * 2) % colores.length], -.48 + i * .32, y + r * .95, .08 - fila * .05));
        }
    });
    return g;
}

// ---------- instalaciones ----------
export function lockers(cantidad = 8) {
    const M = materiales();
    const P = propios();
    const g = grupo();
    for (let i = 0; i < cantidad; i++) {
        const x = (i - (cantidad - 1) / 2) * .46;
        g.add(caja(.44, .9, .48, P.locker, x, .5, 0, .01));
        g.add(caja(.44, .9, .48, P.locker, x, 1.42, 0, .01));
    }
    g.add(caja(cantidad * .46 + .04, .05, .5, M.acero, 0, .025, 0, .01));
    g.add(caja(cantidad * .46 + .04, .04, .52, M.acero, 0, 1.89, 0, .01));
    // Banca de vestidor delante de los casilleros
    g.add(caja(cantidad * .38, .05, .32, P.madera, 0, .45, .7, .01));
    for (const x of [-cantidad * .15, cantidad * .15]) g.add(viga([x, 0, .7], [x, .43, .7], .05, M.acero));
    return g;
}

export function bebedero() {
    const M = materiales();
    const g = grupo(
        caja(.5, .85, .32, M.aluminio, 0, .43, .16, .02),
        caja(.56, .07, .4, M.cromo, 0, .9, .2, .02),
        caja(.5, .62, .06, M.aluminio, 0, 1.28, .03, .01),
        caja(.16, .05, .02, M.ledBlanco, 0, 1.48, .065, .005),
        barra([0, 1.1, .08], [0, 1.1, .16], .012, M.cromo, 10)
    );
    return g;
}

export function tvPared(lineas) {
    const M = materiales();
    const g = grupo(caja(1.62, .94, .06, M.plastico, 0, 0, 0, .01), caja(.3, .3, .1, M.acero, 0, 0, -.06, .01));
    const p = pantallaPlana(1.52, .84, lineas);
    p.position.z = .032;
    g.add(p);
    return g;
}

export function parlante() {
    const M = materiales();
    const g = grupo(caja(.3, .48, .26, M.plastico, 0, 0, 0, .03));
    for (const [y, r] of [[.1, .07], [-.08, .1]]) g.add(malla(new THREE.CylinderGeometry(r, r, .02, 28), M.caucho, 0, y, .13, Math.PI / 2, 0, 0));
    g.add(caja(.08, .08, .2, M.acero, 0, 0, -.2, .01));
    return g;
}

export function ventiladorTecho() {
    const M = materiales();
    const aspas = grupo(malla(new THREE.CylinderGeometry(.22, .22, .16, 28), M.plastico));
    for (let i = 0; i < 6; i++) {
        const a = caja(1.35, .02, .2, M.aluminio, .8, -.04, 0, .006);
        const brazo = grupo(a);
        brazo.rotation.y = i * Math.PI / 3;
        aspas.add(brazo);
    }
    const g = grupo(barra([0, 0, 0], [0, .9, 0], .03, M.acero, 10), aspas);
    g.userData.dinamico = true;
    g.userData.animar = (dt) => { aspas.rotation.y += dt * .9; };
    return g;
}

// Refrigerador de bebidas con puerta de vidrio, junto a la tienda.
export function nevera() {
    const M = materiales();
    const P = propios();
    const g = grupo(
        caja(.75, 1.95, .7, M.plastico, 0, .975, 0, .03),
        caja(.66, .2, .05, M.rojo, 0, 1.82, .35, .01)
    );
    for (let fila = 0; fila < 4; fila++) {
        const y = .25 + fila * .38;
        g.add(caja(.62, .015, .55, M.ledBlanco, 0, y + .28, .02, .004));
        g.add(caja(.62, .015, .55, M.aluminio, 0, y - .01, .02, .004));
        for (let i = 0; i < 6; i++) {
            g.add(malla(geo("lata", () => new THREE.CylinderGeometry(.033, .033, .2, 16)), (i + fila) % 2 ? P.botellaAzul : P.botellaNaranja, -.25 + i * .1, y + .1, .15));
        }
    }
    const vidrio = caja(.66, 1.5, .02, P.vidrio, 0, .82, .36, .005);
    vidrio.castShadow = false;
    g.add(vidrio);
    g.add(barra([.3, .6, .4], [.3, 1.1, .4], .012, M.cromo, 10));
    return g;
}

// Torniquete de acceso con brazo giratorio.
export function torniquete() {
    const M = materiales();
    const g = grupo(
        caja(.24, 1.0, .5, M.aluminio, 0, .5, 0, .03),
        caja(.25, .02, .3, M.ledRojo, 0, 1.0, 0, .006)
    );
    for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        g.add(barra([.12, .8, 0], [.12 + Math.cos(a) * .48, .8 + Math.sin(a) * .12, Math.sin(a) * .4], .02, M.cromo, 10));
    }
    return g;
}
