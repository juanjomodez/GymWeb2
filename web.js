"use strict";

document.addEventListener("DOMContentLoaded", () => {
    setupMobileMenu();
    setupScrollAnimations();
    setupSessionLinks();
    setupMembershipActions();
    setupTrainerActions();
    setupMachineSheetCta();
    setupProductCart();
    setupAuthForms();
});

const servidorDisponible = window.location.protocol !== "file:";

// Una sola consulta de sesión por página; sin servidor (file://) se asume visitante.
let sessionPromise;
function getSession() {
    sessionPromise ??= servidorDisponible
        ? fetch("/api/sesion", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { usuario: null })).then((d) => d.usuario).catch(() => null)
        : Promise.resolve(null);
    return sessionPromise;
}

// Solo rutas locales del sitio: evita redirecciones abiertas a otros dominios.
function safeReturnPath(value) {
    return typeof value === "string" && /^\/(?![/\\])[\w\-./?=&#%]*$/.test(value) ? value : null;
}

function setupMobileMenu() {
    const button = document.querySelector(".menu-movil");
    const nav = document.getElementById(button?.getAttribute("aria-controls") ?? "");
    if (!button || !nav) return;
    const setOpen = (open) => {
        nav.classList.toggle("nav-abierta", open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    };
    button.addEventListener("click", () => setOpen(!nav.classList.contains("nav-abierta")));
    nav.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && nav.classList.contains("nav-abierta")) {
            setOpen(false);
            button.focus();
        }
    });
}

function setupScrollAnimations() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const groups = [
        { selector: "#inicio > div:last-child, #inicio h1, #inicio p, #inicio a", stagger: false },
        { selector: "#planes h2, #entrenadores h2, #rutinas h2, #productos h2, #contacto h2", stagger: false },
        { selector: "#planes > p, #entrenadores > p, #rutinas > p, #productos > p, #contacto > p:not(.dato-contacto)", stagger: false },
        { selector: "#planes article, #entrenadores article, #rutinas article, #productos article", stagger: true },
        { selector: "#contacto .dato-contacto", stagger: true }
    ];
    const elements = new Set();

    groups.forEach(({ selector, stagger }) => {
        document.querySelectorAll(selector).forEach((element, index) => {
            if (elements.has(element)) return;
            elements.add(element);
            element.classList.add("animar-entrada");
            if (stagger) element.style.setProperty("--retraso-entrada", `${(index % 4) * 90}ms`);
        });
    });

    if (!("IntersectionObserver" in window)) {
        elements.forEach((element) => element.classList.add("entrada-visible"));
        return;
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("entrada-visible");
            currentObserver.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });

    elements.forEach((element) => observer.observe(element));
}

async function setupSessionLinks() {
    const links = document.querySelectorAll("[data-enlace-cuenta]");
    if (!links.length) return;
    const user = await getSession();
    if (!user) return;
    links.forEach((link) => {
        link.href = "micuenta.html";
        link.textContent = "Mi cuenta";
    });
}

function createStatusMessage(parent, className = "mensaje-interfaz") {
    const message = document.createElement("p");
    message.className = className;
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    parent.append(message);
    return message;
}

// Los planes llevan a Mi cuenta, donde se confirma la compra simulada. Sin sesión, el servidor
// redirige al login y, al entrar, se vuelve a esta misma compra.
function setupMembershipActions() {
    document.querySelectorAll("#planes article[data-plan]").forEach((card) => {
        const priceBox = card.querySelector(".precio");
        if (!priceBox) return;
        const options = [[card.dataset.plan, card.dataset.planFamiliar ? "Elegir individual" : "Elegir este plan"]];
        if (card.dataset.planFamiliar) options.push([card.dataset.planFamiliar, "Elegir familiar"]);
        for (const [planId, label] of options) {
            const link = document.createElement("a");
            link.className = "plan-accion";
            link.href = `micuenta.html?plan=${encodeURIComponent(planId)}#membresia`;
            link.textContent = label;
            priceBox.append(link);
        }
    });
}

function setupTrainerActions() {
    document.querySelectorAll("#entrenadores article").forEach((card) => {
        const id = card.querySelector("[data-entrenador]")?.dataset.entrenador;
        const name = card.querySelector("h3")?.textContent.trim();
        if (!id) return;
        const link = document.createElement("a");
        link.className = "accion-tarjeta";
        link.href = `micuenta.html?entrenador=${encodeURIComponent(id)}#reservas`;
        link.textContent = "Reservar cita";
        link.setAttribute("aria-label", `Reservar cita con ${name}`);
        card.append(link);
    });
}

// "Quiero entrenar aquí" cierra la ficha de la máquina antes de bajar a los planes.
function setupMachineSheetCta() {
    document.querySelector(".ficha-cta")?.addEventListener("click", () => {
        document.querySelector(".ficha-cerrar")?.click();
    });
}

const CART_KEY = "gymflow-carrito";
function readLocalCart() {
    try {
        const items = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
        return Array.isArray(items) ? items.filter((i) => typeof i?.productoId === "string" && Number.isInteger(i.cantidad) && i.cantidad > 0) : [];
    } catch {
        return [];
    }
}
function writeLocalCart(items) {
    try {
        if (items.length) window.localStorage.setItem(CART_KEY, JSON.stringify(items));
        else window.localStorage.removeItem(CART_KEY);
    } catch { /* almacenamiento bloqueado: el carrito vive solo en esta página */ }
}

function setupProductCart() {
    const productSection = document.querySelector("#productos");
    if (!productSection) return;

    // Catálogo leído de las tarjetas: id → nombre, precio e imagen.
    const catalog = new Map();
    productSection.querySelectorAll("article[data-producto-id]").forEach((card) => {
        catalog.set(card.dataset.productoId, {
            nombre: card.querySelector("h3")?.textContent.trim() ?? "",
            precio: Number(card.querySelector("p:nth-of-type(2)")?.textContent.replace(/\D/g, "")),
            imagen: card.querySelector("img")?.getAttribute("src") ?? ""
        });
    });

    const cart = new Map();
    let loggedIn = false;
    let syncTimer = 0;
    const cartButton = document.createElement("button");
    cartButton.className = "carrito-flotante";
    cartButton.type = "button";
    cartButton.setAttribute("aria-label", "Abrir carrito");
    cartButton.setAttribute("aria-expanded", "false");
    cartButton.setAttribute("aria-controls", "panel-carrito");
    cartButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L21 7H6"></path>
            <circle cx="9" cy="20" r="1.4"></circle>
            <circle cx="18" cy="20" r="1.4"></circle>
        </svg>
        <span class="carrito-contador" aria-live="polite">0</span>
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "carrito-fondo";
    backdrop.hidden = true;

    const panel = document.createElement("aside");
    panel.className = "panel-carrito";
    panel.id = "panel-carrito";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "carrito-titulo");
    panel.setAttribute("aria-hidden", "true");
    panel.inert = true;
    panel.innerHTML = `
        <div class="carrito-encabezado">
            <div><p class="carrito-kicker">GYMFLOW STORE</p><h2 id="carrito-titulo">Tu carrito</h2></div>
            <button class="carrito-cerrar" type="button" aria-label="Cerrar carrito">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="m7 7 10 10M17 7 7 17"></path>
                </svg>
            </button>
        </div>
        <div class="carrito-items" aria-live="polite"></div>
        <div class="carrito-vacio"><span aria-hidden="true">🛒</span><h3>Tu carrito está vacío</h3><p>Agrega productos y aparecerán aquí.</p></div>
        <p class="carrito-feedback" role="status" aria-live="polite"></p>
        <div class="carrito-pie" hidden>
            <div class="carrito-total"><span>Total</span><strong></strong></div>
            <button class="carrito-pagar" type="button">Finalizar compra</button>
            <p class="carrito-nota">Compra simulada: no se realiza ningún cobro real.</p>
        </div>
    `;
    document.body.append(backdrop, panel, cartButton);

    const countLabel = cartButton.querySelector(".carrito-contador");
    const itemList = panel.querySelector(".carrito-items");
    const emptyState = panel.querySelector(".carrito-vacio");
    const footer = panel.querySelector(".carrito-pie");
    const totalLabel = panel.querySelector(".carrito-total strong");
    const payButton = panel.querySelector(".carrito-pagar");
    const note = panel.querySelector(".carrito-nota");
    const feedback = panel.querySelector(".carrito-feedback");
    const currency = new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
    });

    const setPanelOpen = (open) => {
        panel.classList.toggle("carrito-abierto", open);
        backdrop.hidden = !open;
        panel.inert = !open;
        cartButton.setAttribute("aria-expanded", String(open));
        panel.setAttribute("aria-hidden", String(!open));
        document.body.classList.toggle("carrito-bloqueo-scroll", open);
        if (open) panel.querySelector(".carrito-cerrar").focus();
        else cartButton.focus();
    };

    const itemsForApi = () => [...cart].map(([productoId, item]) => ({ productoId, cantidad: item.quantity }));

    // Con sesión el carrito se guarda en MongoDB; sin sesión, en este navegador.
    const persist = () => {
        if (!loggedIn) {
            writeLocalCart(itemsForApi());
            return;
        }
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => syncServer(itemsForApi()), 350);
    };

    const applyServerCart = ({ items }) => {
        cart.clear();
        for (const item of items) {
            cart.set(item.productoId, { name: item.nombre, price: item.precio, image: item.imagen, quantity: item.cantidad });
        }
    };

    async function syncServer(items) {
        try {
            const response = await fetch("/api/carrito", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
            if (response.status === 401) { loggedIn = false; writeLocalCart(items); return; }
            if (!response.ok) throw new Error();
        } catch {
            delete feedback.dataset.tipo;
            feedback.textContent = "No se pudo guardar el carrito. Revisa tu conexión.";
        }
    }

    const renderCart = () => {
        const itemCount = [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
        const total = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
        countLabel.textContent = String(itemCount);
        cartButton.setAttribute("aria-label", `Abrir carrito, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`);
        emptyState.hidden = itemCount > 0;
        footer.hidden = itemCount === 0;
        note.textContent = loggedIn ? "Compra simulada: no se realiza ningún cobro real." : "Inicia sesión para finalizar la compra. Tu carrito se conserva.";
        payButton.textContent = loggedIn ? "Finalizar compra" : "Iniciar sesión para comprar";
        itemList.replaceChildren();

        cart.forEach((item, id) => {
            const row = document.createElement("article");
            row.className = "carrito-item";
            row.dataset.productoId = id;

            const image = document.createElement("img");
            image.src = item.image;
            image.alt = "";

            const info = document.createElement("div");
            info.className = "carrito-item-info";
            const title = document.createElement("h3");
            title.textContent = item.name;
            const price = document.createElement("p");
            price.textContent = currency.format(item.price);
            info.append(title, price);

            const controls = document.createElement("div");
            controls.className = "carrito-cantidad";
            const button = (action, text, label) => {
                const b = document.createElement("button");
                b.type = "button";
                b.dataset.cartAction = action;
                b.textContent = text;
                b.setAttribute("aria-label", label);
                return b;
            };
            const quantity = document.createElement("span");
            quantity.textContent = String(item.quantity);
            const increase = button("increase", "+", `Agregar una unidad de ${item.name}`);
            increase.disabled = item.quantity >= 20;
            controls.append(button("decrease", "−", `Quitar una unidad de ${item.name}`), quantity, increase);

            const remove = button("remove", "Quitar", `Eliminar ${item.name} del carrito`);
            remove.className = "carrito-eliminar";
            row.append(image, info, controls, remove);
            itemList.append(row);
        });

        totalLabel.textContent = currency.format(total);
    };

    cartButton.addEventListener("click", () => setPanelOpen(!panel.classList.contains("carrito-abierto")));
    panel.querySelector(".carrito-cerrar").addEventListener("click", () => setPanelOpen(false));
    backdrop.addEventListener("click", () => setPanelOpen(false));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && panel.classList.contains("carrito-abierto")) setPanelOpen(false);
    });

    productSection.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        const id = button?.closest("article[data-producto-id]")?.dataset.productoId;
        const product = catalog.get(id);
        if (!product || !Number.isFinite(product.precio)) return;

        const currentItem = cart.get(id);
        cart.set(id, {
            name: product.nombre,
            price: product.precio,
            image: product.imagen,
            quantity: Math.min(20, (currentItem?.quantity || 0) + 1)
        });
        feedback.textContent = "";
        renderCart();
        persist();
        cartButton.classList.remove("carrito-rebote");
        void cartButton.offsetWidth;
        cartButton.classList.add("carrito-rebote");
        button.textContent = "Agregado";
        window.setTimeout(() => {
            if (button.isConnected) button.textContent = "Agregar al carrito";
        }, 850);
    });

    panel.addEventListener("click", (event) => {
        const control = event.target.closest("[data-cart-action]");
        if (!control) return;
        const id = control.closest(".carrito-item")?.dataset.productoId;
        const item = cart.get(id);
        if (!item) return;

        if (control.dataset.cartAction === "remove" || (control.dataset.cartAction === "decrease" && item.quantity === 1)) {
            cart.delete(id);
        } else if (control.dataset.cartAction === "decrease") {
            item.quantity -= 1;
        } else if (control.dataset.cartAction === "increase") {
            item.quantity = Math.min(20, item.quantity + 1);
        }
        feedback.textContent = "";
        renderCart();
        persist();
        // Tras re-renderizar, el foco vuelve al mismo control si sigue existiendo.
        panel.querySelector(`.carrito-item[data-producto-id="${id}"] [data-cart-action="${control.dataset.cartAction}"]`)?.focus();
    });

    payButton.addEventListener("click", async () => {
        if (!loggedIn) {
            writeLocalCart(itemsForApi());
            window.location.assign(`login.html?volver=${encodeURIComponent("/index.html#productos")}`);
            return;
        }
        payButton.disabled = true;
        delete feedback.dataset.tipo;
        feedback.textContent = "Procesando el pago simulado…";
        try {
            window.clearTimeout(syncTimer);
            await syncServer(itemsForApi());
            const response = await fetch("/api/pedidos", { method: "POST" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            cart.clear();
            renderCart();
            feedback.textContent = "";
            feedback.dataset.tipo = "exito";
            const done = document.createElement("span");
            done.textContent = `${result.message} `;
            const link = document.createElement("a");
            link.href = "micuenta.html#pedidos";
            link.textContent = "Ver mis compras";
            feedback.append(done, link);
        } catch (error) {
            feedback.textContent = error.message || "No se pudo completar la compra. Intenta nuevamente.";
        } finally {
            payButton.disabled = false;
        }
    });

    // Carga inicial: local para visitantes; con sesión, lo guardado en la cuenta más lo agregado antes de entrar.
    for (const { productoId, cantidad } of readLocalCart()) {
        const product = catalog.get(productoId);
        if (product) cart.set(productoId, { name: product.nombre, price: product.precio, image: product.imagen, quantity: Math.min(20, cantidad) });
    }
    renderCart();
    getSession().then(async (user) => {
        if (!user) return;
        try {
            const response = await fetch("/api/carrito", { cache: "no-store" });
            if (!response.ok) return;
            loggedIn = true;
            const server = await response.json();
            const local = itemsForApi();
            applyServerCart(server);
            if (local.length) {
                for (const { productoId, cantidad } of local) {
                    const product = catalog.get(productoId);
                    const current = cart.get(productoId);
                    cart.set(productoId, { name: product.nombre, price: product.precio, image: product.imagen, quantity: Math.min(20, (current?.quantity || 0) + cantidad) });
                }
                writeLocalCart([]);
                await syncServer(itemsForApi());
            }
            renderCart();
        } catch { /* sin conexión: se mantiene el carrito local */ }
    });
}

function setupAuthForms() {
    const form = document.querySelector(".formulario form");
    if (!form) return;

    const card = form.closest(".formulario");
    const feedback = createStatusMessage(card, "mensaje-interfaz");
    const password = form.querySelector("#password");
    const confirmation = form.querySelector("#confirmar-password");
    const registration = Boolean(confirmation);
    const params = new URLSearchParams(window.location.search);
    // El servidor no recibe el #fragmento al redirigir: se recupera de la URL actual.
    const rawReturn = params.get("volver");
    const returnPath = safeReturnPath(rawReturn && !rawReturn.includes("#") ? rawReturn + window.location.hash : rawReturn);

    // El enlace a la otra página (login ↔ registro) conserva a dónde volver.
    if (returnPath) {
        const other = card.querySelector(`a[href="${registration ? "login.html" : "registro.html"}"]`);
        if (other) other.href += `?volver=${encodeURIComponent(returnPath)}`;
    }

    if (registration) {
        const validatePasswords = () => {
            confirmation.setCustomValidity(
                confirmation.value && confirmation.value !== password.value
                    ? "Las contraseñas no coinciden."
                    : ""
            );
        };
        password.addEventListener("input", validatePasswords);
        confirmation.addEventListener("input", validatePasswords);
    } else {
        if (params.get("registrado")) {
            feedback.textContent = "Cuenta creada correctamente. Ya puedes iniciar sesión.";
            try {
                const email = window.sessionStorage.getItem("gymflow-correo");
                if (email) form.querySelector("#correo").value = email;
                window.sessionStorage.removeItem("gymflow-correo");
                if (email) password.focus();
            } catch { /* almacenamiento bloqueado */ }
        } else if (returnPath) {
            feedback.textContent = "Inicia sesión para continuar.";
        }
        // Si ya hay sesión, no tiene sentido mostrar el formulario.
        getSession().then((user) => { if (user) window.location.replace(returnPath || "micuenta.html"); });
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        feedback.classList.add("mensaje-visible");
        if (!servidorDisponible) {
            feedback.textContent = "Abre esta página desde http://127.0.0.1:3000 para continuar.";
            return;
        }
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        feedback.textContent = registration ? "Creando tu cuenta…" : "Iniciando sesión…";
        try {
            const email = form.querySelector("#correo").value;
            const response = await fetch(registration ? "/api/usuarios" : "/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(registration ? { nombre: form.querySelector("#nombre").value } : {}),
                    correo: email,
                    password: password.value
                })
            });
            const result = await response.json();
            feedback.textContent = result.message || (registration ? "No se pudo completar el registro." : "No se pudo iniciar sesión.");
            if (response.ok) {
                if (!registration) {
                    window.location.assign(returnPath || "micuenta.html");
                    return;
                }
                try { window.sessionStorage.setItem("gymflow-correo", email.trim().toLowerCase()); } catch { /* opcional */ }
                const next = new URLSearchParams({ registrado: "1", ...(returnPath ? { volver: returnPath } : {}) });
                window.location.assign(`login.html?${next}`);
                return;
            }
        } catch {
            feedback.textContent = "No se pudo contactar con el servidor. Comprueba que el backend esté activo.";
        } finally {
            button.disabled = false;
        }
    });
}
