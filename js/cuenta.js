// Mi cuenta: membresía (compra simulada y renovación automática), citas con entrenadores,
// rutinas y compras. Todo se lee y guarda en la API; la página solo existe con sesión iniciada.
const ZONA = "America/Bogota";
const moneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fechaLarga = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: ZONA });
const fechaHora = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: ZONA });
const OBJETIVOS = { fuerza: "Fuerza", hipertrofia: "Hipertrofia", resistencia: "Resistencia", "perdida-grasa": "Pérdida de grasa" };
const MUSCULOS = {
    pectorales: "Pectorales", deltoides: "Deltoides", biceps: "Bíceps", triceps: "Tríceps", antebrazos: "Antebrazos",
    abdominales: "Abdominales", oblicuos: "Oblicuos", trapecio: "Trapecio", dorsales: "Dorsales", lumbares: "Zona lumbar",
    gluteos: "Glúteos", cuadriceps: "Cuádriceps", isquiotibiales: "Isquiotibiales", gemelos: "Gemelos"
};

const $ = (selector, raiz = document) => raiz.querySelector(selector);
const parametros = new URLSearchParams(location.search);
const mensajeGeneral = $("#cuenta-mensaje");

// Crea un elemento con texto seguro (nunca se inserta HTML con datos de la API).
function el(etiqueta, { clase, texto, attrs } = {}, ...hijos) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    for (const [k, v] of Object.entries(attrs ?? {})) nodo.setAttribute(k, v);
    nodo.append(...hijos.filter(Boolean));
    return nodo;
}

async function api(ruta, { metodo = "GET", cuerpo } = {}) {
    let respuesta;
    try {
        respuesta = await fetch(ruta, {
            method: metodo,
            cache: "no-store",
            headers: cuerpo ? { "Content-Type": "application/json" } : {},
            body: cuerpo ? JSON.stringify(cuerpo) : undefined
        });
    } catch {
        return { ok: false, status: 0, body: { message: "No se pudo contactar con el servidor." } };
    }
    if (respuesta.status === 401) {
        location.replace(`login.html?volver=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
        return new Promise(() => { });
    }
    const body = await respuesta.json().catch(() => ({}));
    return { ok: respuesta.ok, status: respuesta.status, body };
}

function avisar(nodo, texto, tipo = "info") {
    nodo.textContent = texto;
    nodo.dataset.tipo = tipo;
}

// ---------- pestañas ----------
const pestanas = [...document.querySelectorAll(".cuenta-pestanas [role=tab]")];
const cargadores = {};
const cargados = new Set();

function mostrarPanel(id, { foco = false } = {}) {
    if (!pestanas.some((p) => p.dataset.panel === id)) id = "membresia";
    for (const p of pestanas) {
        const activa = p.dataset.panel === id;
        p.setAttribute("aria-selected", String(activa));
        p.tabIndex = activa ? 0 : -1;
        document.getElementById(p.dataset.panel).hidden = !activa;
        if (activa && foco) p.focus();
    }
    history.replaceState(null, "", `${location.pathname}${location.search}#${id}`);
    if (!cargados.has(id)) {
        cargados.add(id);
        cargadores[id]?.();
    }
}

pestanas.forEach((p, i) => {
    p.addEventListener("click", () => mostrarPanel(p.dataset.panel));
    p.addEventListener("keydown", (e) => {
        const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        mostrarPanel(pestanas[(i + dir + pestanas.length) % pestanas.length].dataset.panel, { foco: true });
    });
});
window.addEventListener("hashchange", () => mostrarPanel(location.hash.slice(1)));

// ---------- membresía ----------
let planes = [];
let membresiaActual = null;
const tarjetaMembresia = $(".membresia-estado");
const dialogo = $("#dialogo-compra");
let planEnCompra = null;

function diasRestantes(fin) {
    return Math.max(0, Math.ceil((new Date(fin) - Date.now()) / 864e5));
}

function pintarMembresia() {
    const m = membresiaActual;
    if (!m) {
        tarjetaMembresia.replaceChildren(
            el("p", { clase: "kicker", texto: "Sin membresía activa" }),
            el("h2", { texto: "Elige un plan para empezar a entrenar" }),
            el("p", { clase: "cuenta-nota", texto: "Cuando compres un plan verás aquí su estado, sus fechas y el tiempo restante." })
        );
        return;
    }
    const total = Math.max(1, (new Date(m.fechaFin) - new Date(m.fechaInicio)) / 864e5);
    const quedan = diasRestantes(m.fechaFin);
    const barra = el("div", { clase: "progreso", attrs: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(Math.round(total)), "aria-valuenow": String(quedan), "aria-label": "Días restantes" } }, el("span"));
    barra.firstChild.style.width = `${Math.min(100, quedan / total * 100)}%`;
    const interruptor = el("button", { clase: "interruptor", attrs: { type: "button", role: "switch", "aria-checked": String(m.renovacionAutomatica), "aria-labelledby": "renovacion-etiqueta" } }, el("span"));
    interruptor.addEventListener("click", () => cambiarRenovacion(interruptor));

    tarjetaMembresia.replaceChildren(
        el("div", { clase: "membresia-cabecera" },
            el("div", {}, el("p", { clase: "kicker", texto: "Plan contratado" }), el("h2", { texto: m.plan.nombre })),
            el("span", { clase: "estado estado-activa", texto: "Activa" })),
        el("dl", { clase: "membresia-datos" },
            el("div", {}, el("dt", { texto: "Inicio" }), el("dd", { texto: fechaLarga.format(new Date(m.fechaInicio)) })),
            el("div", {}, el("dt", { texto: "Finaliza" }), el("dd", { texto: fechaLarga.format(new Date(m.fechaFin)) })),
            el("div", {}, el("dt", { texto: "Tiempo restante" }), el("dd", { texto: `${quedan} ${quedan === 1 ? "día" : "días"}` })),
            el("div", {}, el("dt", { texto: "Valor mensual" }), el("dd", { texto: moneda.format(m.plan.precioMensual) }))),
        barra,
        el("div", { clase: "renovacion" },
            el("div", {},
                el("p", { texto: "Renovación automática", attrs: { id: "renovacion-etiqueta" } }),
                el("p", { clase: "cuenta-nota", texto: m.renovacionAutomatica ? `Se renovará por ${m.meses} ${m.meses === 1 ? "mes" : "meses"} al finalizar.` : "Tu plan terminará en la fecha de finalización." })),
            interruptor),
        el("p", { clase: "aviso aviso-renovacion", attrs: { role: "status", "aria-live": "polite" } })
    );
}

async function cambiarRenovacion(boton) {
    const activar = boton.getAttribute("aria-checked") !== "true";
    boton.disabled = true;
    const r = await api("/api/membresia", { metodo: "PATCH", cuerpo: { renovacionAutomatica: activar } });
    if (r.ok) {
        membresiaActual = r.body.membresia;
        pintarMembresia();
        avisar($(".aviso-renovacion"), r.body.message, "exito");
        $(".interruptor")?.focus();
    } else {
        boton.disabled = false;
        avisar($(".aviso-renovacion"), r.body.message || "No se pudo cambiar la renovación.", "error");
    }
}

function pintarPlanes() {
    $(".planes-cuenta").replaceChildren(...planes.map((p) => {
        const actual = membresiaActual?.planId === p.id;
        const boton = el("button", { clase: actual ? "boton-fantasma" : "boton", texto: actual ? "Extender este plan" : membresiaActual ? "Cambiar a este plan" : "Comprar", attrs: { type: "button" } });
        boton.addEventListener("click", () => abrirCompra(p));
        return el("article", { clase: `tarjeta plan-cuenta${actual ? " plan-actual" : ""}` },
            actual ? el("span", { clase: "estado estado-activa", texto: "Tu plan" }) : null,
            el("h3", { texto: p.nombre }),
            el("p", { clase: "plan-precio", texto: `${moneda.format(p.precioMensual)} / mes` }),
            el("p", { clase: "cuenta-nota", texto: p.descripcion }),
            el("ul", {}, ...p.beneficios.map((b) => el("li", { texto: b }))),
            boton);
    }));
}

function pintarHistorial(historial) {
    const ESTADOS = { activa: "Activa", vencida: "Vencida", reemplazada: "Reemplazada" };
    $(".lista-historial").replaceChildren(...(historial.length ? historial.map((m) => el("li", {},
        el("strong", { texto: m.plan.nombre }),
        el("span", { texto: `${fechaLarga.format(new Date(m.fechaInicio))} – ${fechaLarga.format(new Date(m.fechaFin))}` }),
        el("span", { clase: `estado estado-${m.estado}`, texto: ESTADOS[m.estado] }),
        el("span", { texto: moneda.format(m.precioPagado) })
    )) : [el("li", { texto: "Aún no has comprado membresías." })]));
}

function actualizarTotalCompra() {
    const meses = Number($("#compra-meses").value);
    $(".compra-total").textContent = `Total: ${moneda.format(planEnCompra.precioMensual * meses)}`;
}

function abrirCompra(plan) {
    planEnCompra = plan;
    const extension = membresiaActual?.planId === plan.id;
    $(".compra-plan").textContent = extension
        ? `Vas a extender tu ${plan.nombre}. El tiempo se suma a tu fecha de finalización.`
        : membresiaActual
            ? `Vas a cambiar tu ${membresiaActual.plan.nombre} por el ${plan.nombre}. El nuevo plan empieza hoy.`
            : `Vas a activar el ${plan.nombre} desde hoy.`;
    actualizarTotalCompra();
    dialogo.showModal();
}
$("#compra-meses").addEventListener("change", actualizarTotalCompra);
dialogo.addEventListener("close", async () => {
    if (dialogo.returnValue !== "comprar" || !planEnCompra) return;
    avisar(mensajeGeneral, "Procesando el pago simulado…");
    const r = await api("/api/membresias", { metodo: "POST", cuerpo: { planId: planEnCompra.id, meses: Number($("#compra-meses").value) } });
    avisar(mensajeGeneral, r.body.message || "No se pudo completar la compra.", r.ok ? "exito" : "error");
    if (r.ok) await cargarMembresia();
    mensajeGeneral.scrollIntoView({ behavior: "smooth", block: "center" });
});

async function cargarMembresia() {
    const [rPlanes, rMembresia] = await Promise.all([api("/api/planes"), api("/api/membresia")]);
    if (!rPlanes.ok || !rMembresia.ok) {
        tarjetaMembresia.replaceChildren(el("p", { clase: "aviso", texto: "No se pudo cargar tu membresía. Intenta recargar la página.", attrs: { "data-tipo": "error" } }));
        return;
    }
    planes = rPlanes.body.planes;
    membresiaActual = rMembresia.body.actual;
    pintarMembresia();
    pintarPlanes();
    pintarHistorial(rMembresia.body.historial);
    // Llegó desde "Elegir este plan" en la portada: se abre la confirmación una sola vez.
    const elegido = planes.find((p) => p.id === parametros.get("plan"));
    if (elegido) {
        parametros.delete("plan");
        history.replaceState(null, "", `${location.pathname}${parametros.size ? `?${parametros}` : ""}${location.hash}`);
        abrirCompra(elegido);
    }
}
cargadores.membresia = cargarMembresia;

// ---------- reservas ----------
const formReserva = $(".form-reserva");
const selectEntrenador = $("#reserva-entrenador");
const inputFecha = $("#reserva-fecha");
const listaHorarios = $(".lista-horarios");
const botonReservar = $("button[type=submit]", formReserva);
const avisoReserva = $(".aviso", formReserva);
let entrenadores = [];

const hoyCali = (desplazDias = 0) => new Date(Date.now() - 5 * 36e5 + desplazDias * 864e5).toISOString().slice(0, 10);

async function cargarHorarios() {
    botonReservar.disabled = true;
    const id = selectEntrenador.value;
    const e = entrenadores.find((x) => x.id === id);
    $(".entrenador-detalle").textContent = e ? `${e.especialidad} · ${e.zona}` : "";
    if (!id || !inputFecha.value) return;
    listaHorarios.replaceChildren(el("p", { clase: "cuenta-nota", texto: "Buscando horarios…" }));
    const r = await api(`/api/entrenadores/${encodeURIComponent(id)}/disponibilidad?fecha=${inputFecha.value}`);
    if (!r.ok) {
        listaHorarios.replaceChildren(el("p", { clase: "cuenta-nota", texto: r.body.message || "No se pudieron cargar los horarios." }));
        return;
    }
    const horarios = r.body.horarios;
    if (!horarios.length) {
        listaHorarios.replaceChildren(el("p", { clase: "cuenta-nota", texto: "No hay horarios ese día. Prueba con otra fecha." }));
        return;
    }
    listaHorarios.replaceChildren(...horarios.map((h) => {
        const input = el("input", { attrs: { type: "radio", name: "horario", value: h.inicio, id: `h-${h.hora}` } });
        input.disabled = !h.disponible;
        input.addEventListener("change", () => { botonReservar.disabled = false; });
        return el("label", { clase: "horario", attrs: { for: `h-${h.hora}` } }, input, el("span", { texto: h.disponible ? h.hora : `${h.hora} · ocupado` }));
    }));
}

async function cargarReservas() {
    const r = await api("/api/reservas");
    const lista = $(".lista-reservas");
    if (!r.ok) {
        lista.replaceChildren(el("li", { texto: "No se pudieron cargar tus citas." }));
        return;
    }
    if (!r.body.reservas.length) {
        lista.replaceChildren(el("li", { clase: "vacio", texto: "Todavía no tienes citas." }));
        return;
    }
    lista.replaceChildren(...r.body.reservas.map((res) => {
        const futura = new Date(res.inicio) > Date.now() && res.estado === "confirmada";
        const item = el("li", { clase: "tarjeta reserva" },
            el("img", { attrs: { src: res.imagen ?? "img/logo.png", alt: "", loading: "lazy", width: "56", height: "56" } }),
            el("div", {}, el("strong", { texto: res.entrenador }), el("span", { texto: fechaHora.format(new Date(res.inicio)) })),
            el("span", { clase: `estado estado-${res.estado === "cancelada" ? "cancelada" : futura ? "activa" : "vencida"}`, texto: res.estado === "cancelada" ? "Cancelada" : futura ? "Confirmada" : "Realizada" }));
        if (futura) {
            const cancelar = el("button", { clase: "boton-fantasma", texto: "Cancelar", attrs: { type: "button", "aria-label": `Cancelar cita con ${res.entrenador}` } });
            cancelar.addEventListener("click", async () => {
                if (!confirm(`¿Cancelar la cita con ${res.entrenador}?`)) return;
                cancelar.disabled = true;
                const c = await api(`/api/reservas/${res.id}`, { metodo: "DELETE" });
                avisar(avisoReserva, c.body.message || "No se pudo cancelar.", c.ok ? "exito" : "error");
                await Promise.all([cargarReservas(), cargarHorarios()]);
            });
            item.append(cancelar);
        }
        return item;
    }));
}

formReserva.addEventListener("submit", async (e) => {
    e.preventDefault();
    const elegido = $("input[name=horario]:checked", formReserva);
    if (!elegido) return;
    botonReservar.disabled = true;
    const r = await api("/api/reservas", { metodo: "POST", cuerpo: { entrenadorId: selectEntrenador.value, inicio: elegido.value } });
    if (r.ok) avisar(avisoReserva, `Cita confirmada: ${fechaHora.format(new Date(r.body.reserva.inicio))} con ${r.body.reserva.entrenador}.`, "exito");
    else {
        const conEnlace = r.status === 403;
        avisar(avisoReserva, r.body.message || "No se pudo reservar.", "error");
        if (conEnlace) {
            const a = el("a", { texto: " Ver planes Premium", attrs: { href: "#membresia" } });
            avisoReserva.append(a);
        }
    }
    await Promise.all([cargarReservas(), cargarHorarios()]);
});
selectEntrenador.addEventListener("change", cargarHorarios);
inputFecha.addEventListener("change", cargarHorarios);

cargadores.reservas = async () => {
    inputFecha.min = hoyCali();
    inputFecha.max = hoyCali(29);
    inputFecha.value = hoyCali(1);
    const r = await api("/api/entrenadores");
    entrenadores = r.ok ? r.body.entrenadores : [];
    selectEntrenador.replaceChildren(...entrenadores.map((e) => el("option", { texto: `${e.nombre} — ${e.especialidad}`, attrs: { value: e.id } })));
    const pedido = parametros.get("entrenador");
    if (entrenadores.some((e) => e.id === pedido)) selectEntrenador.value = pedido;
    await Promise.all([cargarHorarios(), cargarReservas()]);
};

// ---------- rutinas ----------
const contRutinas = $(".rutinas-cuenta");
const detalleRutina = $(".rutina-detalle");

async function cargarRutinas(objetivo = "") {
    document.querySelectorAll(".filtros-rutinas button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.objetivo === objetivo)));
    const r = await api(`/api/rutinas${objetivo ? `?objetivo=${objetivo}` : ""}`);
    if (!r.ok) {
        contRutinas.replaceChildren(el("p", { texto: "No se pudieron cargar las rutinas." }));
        return;
    }
    contRutinas.replaceChildren(...r.body.rutinas.map((rut) => {
        const boton = el("button", { clase: "boton-fantasma", texto: "Ver rutina", attrs: { type: "button", "aria-label": `Ver rutina ${rut.nombre}` } });
        boton.addEventListener("click", () => abrirRutina(rut.id));
        return el("article", { clase: "tarjeta rutina" },
            el("span", { clase: "etiqueta-rutina", texto: OBJETIVOS[rut.objetivo] }),
            el("h3", { texto: rut.nombre }),
            el("p", { clase: "cuenta-nota", texto: rut.descripcion }),
            el("p", { clase: "rutina-meta", texto: `${rut.nivel[0].toUpperCase()}${rut.nivel.slice(1)} · ${rut.diasPorSemana} días/semana · ${rut.duracionMin} min` }),
            boton);
    }));
}

async function abrirRutina(id) {
    const r = await api(`/api/rutinas/${encodeURIComponent(id)}`);
    if (!r.ok) return;
    const rut = r.body.rutina;
    const cerrar = el("button", { clase: "boton-fantasma", texto: "Cerrar", attrs: { type: "button" } });
    cerrar.addEventListener("click", () => { detalleRutina.hidden = true; });
    const tabla = el("table", {},
        el("caption", { clase: "oculto", texto: `Ejercicios de ${rut.nombre}` }),
        el("thead", {}, el("tr", {}, ...["Ejercicio", "Series", "Repeticiones", "Descanso", "Músculos"].map((t) => el("th", { texto: t, attrs: { scope: "col" } })))),
        el("tbody", {}, ...rut.ejercicios.map((ej) => el("tr", {},
            el("th", { texto: ej.nombre, attrs: { scope: "row" } }),
            el("td", { texto: String(ej.series), attrs: { "data-titulo": "Series" } }),
            el("td", { texto: ej.repeticiones, attrs: { "data-titulo": "Reps" } }),
            el("td", { texto: ej.descansoSeg ? `${ej.descansoSeg} s` : "—", attrs: { "data-titulo": "Descanso" } }),
            el("td", { texto: ej.musculos.map((m) => MUSCULOS[m] ?? m).join(", "), attrs: { "data-titulo": "Músculos" } })))));
    detalleRutina.replaceChildren(
        el("div", { clase: "membresia-cabecera" },
            el("div", {}, el("p", { clase: "kicker", texto: `${OBJETIVOS[rut.objetivo]} · ${rut.nivel}` }), el("h2", { texto: rut.nombre })),
            cerrar),
        el("p", { clase: "cuenta-nota", texto: `${rut.descripcion} ${rut.diasPorSemana} días por semana, unos ${rut.duracionMin} minutos por sesión.` }),
        el("div", { clase: "tabla-scroll" }, tabla));
    detalleRutina.hidden = false;
    detalleRutina.focus({ preventScroll: true });
    detalleRutina.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll(".filtros-rutinas button").forEach((b) => b.addEventListener("click", () => cargarRutinas(b.dataset.objetivo)));
cargadores.rutinas = async () => {
    await cargarRutinas();
    if (parametros.get("rutina")) abrirRutina(parametros.get("rutina"));
};

// ---------- pedidos ----------
cargadores.pedidos = async () => {
    const r = await api("/api/pedidos");
    const lista = $(".lista-pedidos");
    if (!r.ok) {
        lista.replaceChildren(el("li", { texto: "No se pudieron cargar tus compras." }));
        return;
    }
    lista.replaceChildren(...(r.body.pedidos.length ? r.body.pedidos.map((p) => el("li", { clase: "tarjeta pedido" },
        el("div", { clase: "membresia-cabecera" },
            el("div", {}, el("strong", { texto: `Pedido ${p.referencia}` }), el("span", { clase: "cuenta-nota", texto: fechaLarga.format(new Date(p.createdAt)) })),
            el("span", { clase: "estado estado-activa", texto: "Pagado" })),
        el("ul", {}, ...p.items.map((i) => el("li", { texto: `${i.cantidad} × ${i.nombre} — ${moneda.format(i.subtotal)}` }))),
        el("p", { clase: "plan-precio", texto: `Total ${moneda.format(p.total)}` })
    )) : [el("li", { clase: "vacio", texto: "Aún no has hecho compras en la tienda." })]));
};

// ---------- sesión ----------
const botonSalir = $("#cerrar-sesion");
botonSalir.addEventListener("click", async () => {
    botonSalir.disabled = true;
    const r = await api("/api/logout", { metodo: "POST" });
    if (r.ok) location.replace("login.html");
    else {
        botonSalir.disabled = false;
        avisar(mensajeGeneral, "No se pudo cerrar sesión. Intenta nuevamente.", "error");
    }
});

(async () => {
    const r = await api("/api/me");
    if (r.ok) {
        $("#cuenta-nombre").textContent = r.body.usuario.nombre.split(" ")[0];
        $("#cuenta-correo").textContent = r.body.usuario.correo;
    } else {
        avisar(mensajeGeneral, "No se pudo cargar tu cuenta. Intenta recargar la página.", "error");
    }
    mostrarPanel(location.hash.slice(1) || (parametros.get("entrenador") ? "reservas" : parametros.get("rutina") ? "rutinas" : "membresia"));
})();
