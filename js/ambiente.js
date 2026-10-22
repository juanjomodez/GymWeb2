// Densidad del gimnasio: equipos extra por zona, instalaciones (recepción, casilleros, bebederos,
// pantallas, ventiladores) y decoración. Los modelos CC0 de Poly Haven (assets/modelos/props.glb)
// se cargan después del primer cuadro para no retrasar la entrada.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import * as T from "./texturas.js";
import { letras, materialesLetrero } from "./texto3d.js";
import { materiales, grupo, caja, banco, rackPotencia, arbolDiscos, caminadora, bicicleta, malla } from "./modelos.js";
import {
    multipower, poleaCruzada, extensionPiernas, pressPecho, bancoAjustable, soporteBarras, discosApoyados,
    puestoMancuernas, remo, eliptica, rigFuncional, trineo, zonaEstiramiento, rackBalones, lockers, bebedero,
    tvPared, parlante, ventiladorTecho, nevera, torniquete, pantallaPlana
} from "./equipamiento.js";

const PROPS = "assets/modelos/props.glb";

function cartelPared(titulo, subtitulo, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshStandardMaterial({ map: T.cartel(titulo, subtitulo), roughness: .6 }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    return m;
}

function recepcion(fuente) {
    const M = materiales();
    const g = grupo();
    const madera = new THREE.MeshStandardMaterial({ color: 0x5b3d26, roughness: .55 });
    // Mostrador en L con frente iluminado
    g.add(caja(4.2, 1.1, .75, M.plastico, 0, .55, 0, .03));
    g.add(caja(4.3, .05, .85, madera, 0, 1.12, 0, .01));
    g.add(caja(.75, 1.1, 1.8, M.plastico, -2.45, .55, -.55, .03));
    g.add(caja(.85, .05, 1.9, madera, -2.45, 1.12, -.55, .01));
    g.add(caja(4.2, .03, .02, M.ledRojo, 0, .1, .38, .006));
    g.add(caja(.02, .03, 1.8, M.ledRojo, -2.84, .1, -.55, .006));
    // Monitores
    for (const x of [-.9, .9]) {
        const pie = caja(.08, .3, .08, M.acero, x, 1.3, -.15, .01);
        const marco = caja(.6, .36, .04, M.plastico, x, 1.55, -.12, .01);
        const p = pantallaPlana(.54, .3, ["RECEPCIÓN", "GYMFLOW", "horario 5:00 – 22:00"]);
        p.position.z = .022;
        marco.add(p);
        g.add(pie, marco);
    }
    // Muro de marca detrás del mostrador
    g.add(caja(6, 3.2, .15, M.plastico, 0, 1.6, -1.9, .02));
    g.add(caja(6, .04, .04, M.ledRojo, 0, 3.18, -1.8, .01));
    if (fuente) {
        const marca = letras(fuente, "GYMFLOW", { tamano: .8, profundidad: .08, materiales: materialesLetrero({ frente: "rojo", intensidad: 2 }) });
        marca.position.set(0, 2.15, -1.8);
        const lema = letras(fuente, "BIENVENIDO A TU NUEVA ERA", { tamano: .16, profundidad: .02, materiales: materialesLetrero({ frente: "blanco", intensidad: .7 }) });
        lema.position.set(0, 1.62, -1.8);
        g.add(marca, lema);
    }
    // Torniquetes de acceso
    for (const x of [2.8, 3.6]) {
        const t = torniquete();
        t.position.set(x, 0, .1);
        g.add(t);
    }
    return g;
}

// Agrega equipos y ambiente al escenario. `colocar` registra los equipos interactivos;
// el resto se agrega directamente a `escena`.
export function amueblar({ escena, techo, animables, fuente }) {
    const M = materiales();
    const poner = (objeto, x, z, ry = 0, y = 0) => {
        objeto.position.set(x, y, z);
        objeto.rotation.y = ry;
        escena.add(objeto);
        if (objeto.userData.animar) animables.push(objeto.userData.animar);
        return objeto;
    };

    // ---------- peso libre ----------
    const plataforma2 = grupo(
        malla(new THREE.PlaneGeometry(2.6, 2.6), M.caucho, 0, .011, 0, -Math.PI / 2),
        caja(2.6, .02, .02, M.ledRojo, 0, .012, 1.3, .006)
    );
    poner(plataforma2, -13.4, -4.8, .15);
    poner(rackPotencia(), -13.4, -4.8, .15);
    poner(arbolDiscos(), -16.2, -5.6, -.4);
    poner(soporteBarras(), -4.4, -5.8);
    poner(bancoAjustable(.6), -11.6, 2.2, Math.PI / 2);
    poner(bancoAjustable(.35), -9.4, 2.4, Math.PI / 2 + .15);
    poner(banco(), -4.6, -2.2, .1);
    poner(puestoMancuernas(), -10.5, 2.3, .4);
    poner(puestoMancuernas(), -12.7, 2.1, -.3);
    poner(discosApoyados(5), -17.6, -6.0, 0);
    poner(discosApoyados(4), -7.2, -6.1, Math.PI / 2);
    const espejo = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, metalness: 1, roughness: .04 });
    escena.add(caja(.04, 2.3, 6.6, espejo, -17.95, 1.55, -1.4, .01));
    escena.add(caja(.06, .06, 6.7, M.acero, -17.93, 2.72, -1.4, .01));

    // ---------- máquinas ----------
    poner(multipower(), 15.2, -3.4, Math.PI / 2);
    poner(banco(), 15.2, -3.4, 0);
    poner(poleaCruzada(), 9.4, -5.85, 0);
    // Fila lateral: fuera de la línea de cámara hacia la polea y la prensa.
    poner(extensionPiernas(), 9.6, 1.6, 0);
    poner(pressPecho(), 11.5, 1.65, 0);
    poner(extensionPiernas(), 13.4, 1.6, 0);
    poner(pressPecho(), 15.3, 1.65, 0);
    poner(bebedero(), 12, -6.3, 0);
    poner(lockers(6), 17.7, 2.2, -Math.PI / 2);

    // ---------- cardio ----------
    const filaCardio2 = grupo();
    for (const x of [-1.35, 0, 1.35]) {
        const c = caminadora();
        c.position.x = x;
        filaCardio2.add(c);
        animables.push(c.userData.animar);
    }
    poner(filaCardio2, -13.4, -17.6, 0);
    for (const x of [-15.6, -14.3, -13.0]) poner(eliptica(), x, -13.9, 0);
    for (const x of [-15.6, -14.4, -13.2]) poner(remo(), x, -21.0, 0);
    for (const x of [-4.6, -3.5]) {
        const b = bicicleta();
        b.userData.dinamico = true;
        poner(b, x, -19.6, 0);
    }
    poner(bebedero(), -12, -6.3, 0);
    for (const [x, lineas] of [[-14.2, ["CLASE HIIT", "18:00", "sala funcional · 12 cupos"]], [-9.4, ["RITMO CARDÍACO", "142", "bpm · zona aeróbica"]], [-4.6, ["RETO DEL MES", "50 km", "en bicicleta o caminadora"]]]) {
        poner(tvPared(lineas), x, -29.9, 0, 3.3);
    }

    // ---------- funcional ----------
    poner(rigFuncional(6), 17.55, -18, -Math.PI / 2);
    poner(trineo(), 6.4, -20.6, .3);
    poner(trineo(), 7.6, -20.3, -.1);
    poner(zonaEstiramiento(), 13.6, -23.7, 0);
    poner(rackBalones(), 12.6, -11.4, Math.PI);
    const pizarra = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ map: T.pizarraWod(["5 rondas por tiempo:", "• 10 swings con pesa rusa", "• 8 saltos al cajón", "• 30 s de cuerdas de batalla", "• 20 m de trineo"]), roughness: .4 }));
    pizarra.position.set(17.94, 2.0, -12.6);
    pizarra.rotation.y = -Math.PI / 2;
    escena.add(pizarra, caja(.05, 1.7, 2.5, M.acero, 17.96, 2.0, -12.6, .01));

    // ---------- entrada, casilleros y tienda ----------
    poner(recepcion(fuente), -9.6, 11.4, 0);
    poner(lockers(8), -17.7, 6.2, Math.PI / 2);
    poner(nevera(), 17.3, 11.6, -Math.PI / 2);
    poner(nevera(), 17.3, 12.4, -Math.PI / 2);

    // ---------- muros: carteles, parlantes ----------
    escena.add(
        cartelPared("SIN EXCUSAS", "cada repetición cuenta", -17.94, 2.3, -24, Math.PI / 2),
        cartelPared("UN REP MÁS", "tu único límite eres tú", -17.94, 2.3, 2.95, Math.PI / 2),
        cartelPared("FUERZA REAL", "construida día a día", 17.94, 2.3, -9, -Math.PI / 2),
        cartelPared("SUDA SONRÍE REPITE", "GymFlow · Cali", 14.6, 2.3, -29.94, 0),
        cartelPared("NUEVA ERA", "entrena · mejora · supera", 9.6, 2.3, -29.94, 0)
    );
    for (const [x, z, ry] of [[-12, -6.5, 0], [12, -6.5, 0], [-12, -20.5, 0], [12, -20.5, 0]]) {
        poner(parlante(), x, z, ry, 5.2);
    }

    // ---------- techo: ventiladores industriales (se ocultan con el techo en la vista cenital) ----------
    for (const [x, z] of [[-8.5, -24.5], [8.5, -24.5], [4, -17], [-5, 3.5], [5, -12]]) {
        const v = ventiladorTecho();
        v.position.set(x, 6.15, z);
        techo.add(v);
        animables.push(v.userData.animar);
    }
}

// Ubicación de los modelos CC0: [id, x, z, rotación, escala, y].
const UBICACION_PROPS = [
    ["potted_plant_02", -13.2, 12.6, 0, 1.6],
    ["potted_plant_02", -6.0, 12.6, 1.2, 1.6],
    ["potted_plant_02", 5.2, 8.6, 2, 1.5],
    ["potted_plant_02", 12.9, 8.6, .5, 1.5],
    ["potted_plant_02", -17.1, -27.4, 1, 1.7],
    ["potted_plant_02", 17.1, -27.6, 2.2, 1.7],
    ["potted_plant_02", -2.6, -29.2, .3, 1.6],
    ["potted_plant_02", 2.6, -29.2, 2.8, 1.6],
    ["planter_box_01", 14.6, 12.9, 0, 1.4],
    ["potted_plant_04", -10.4, 11.5, 0, 1.4, 1.145],
    ["potted_plant_04", -8.6, 11.45, 2, 1.2, 1.145],
    ["old_tyre", 14.1, -12.6, 0, 2.1, .17],
    ["old_tyre", 17.55, -24.6, -Math.PI / 2, 2],
    ["standing_chalkboard_01", 4.6, -11.6, Math.PI * .85, 1.1],
    ["sofa_02", -15.6, 11.6, Math.PI / 2, 1],
    ["modern_arm_chair_01", -14.8, 9.4, Math.PI * .75, 1],
    ["WetFloorSign_01", -10.9, -6.9, .6, 1],
    ["metal_trash_can", 13.6, -29.4, 0, 1],
    ["metal_trash_can", -4.0, 13.0, Math.PI, 1],
    ["wall_clock", 17.9, 2.2, -Math.PI / 2, 2.4, 3.4],
    ["wall_clock", -17.9, -18, Math.PI / 2, 2.4, 3.4],
    ["security_camera_01", -17.5, 13.4, Math.PI * .75, 1.2, 6.4],
    ["security_camera_01", 17.5, -29.5, -Math.PI / 4, 1.2, 6.4],
    ["hanging_industrial_lamp", -11.0, 11.4, 0, 1.4, 4.6],
    ["hanging_industrial_lamp", -9.6, 11.4, 0, 1.4, 4.6],
    ["hanging_industrial_lamp", -8.2, 11.4, 0, 1.4, 4.6]
];

export async function cargarProps(escena) {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(PROPS);
    const moldes = {};
    for (const nodo of gltf.scene.children) moldes[nodo.name.replace(/_base$/, "")] = nodo;
    const grupoProps = grupo();
    grupoProps.name = "props";
    for (const [id, x, z, ry, escala, y = 0] of UBICACION_PROPS) {
        const molde = moldes[id];
        if (!molde) continue;
        const copia = molde.clone();
        copia.position.set(x, y, z);
        copia.rotation.set(id === "old_tyre" && y > 0 ? Math.PI / 2 : 0, ry, 0);
        copia.scale.setScalar(escala);
        // Apoya el modelo en su altura y lo centra en (x, z) ya rotado y escalado.
        copia.updateMatrixWorld(true);
        const caja3 = new THREE.Box3().setFromObject(copia);
        copia.position.x += x - (caja3.min.x + caja3.max.x) / 2;
        copia.position.z += z - (caja3.min.z + caja3.max.z) / 2;
        copia.position.y += y - caja3.min.y;
        copia.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = !/camera|clock/.test(id);
            o.receiveShadow = true;
        });
        grupoProps.add(copia);
    }
    // Cables de las lámparas colgantes hasta el techo.
    const M = materiales();
    for (const x of [-11.0, -9.6, -8.2]) grupoProps.add(caja(.012, 7.5 - (4.6 + 1.36 * 1.4), .012, M.caucho, x, (7.5 + 4.6 + 1.36 * 1.4) / 2, 11.4, .004));
    escena.add(grupoProps);
    return grupoProps;
}
