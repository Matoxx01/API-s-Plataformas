let token = null;
let role = null;
let vendorToken = null;
let allArticles = [];
let currentCategory = null;
let currentSubcats  = [];

// Elementos del DOM
const formSectionEl     = document.getElementById("form-section");
const formContainerEl   = document.getElementById("form-container");
const responseSectionEl = document.getElementById("response-section");
const outputEl          = document.getElementById("output");
const catalogSectionEl  = document.getElementById("catalog-section");
const catalogButtonsEl  = document.getElementById("catalog-buttons");
const cardsContainerEl  = document.getElementById("cards-container");

// ----------------- LOGIN -----------------
async function login() {
  const user = document.getElementById("user").value;
  const pwd  = document.getElementById("password").value;
  const err  = document.getElementById("login-error");
  err.textContent = "";

  try {
    const res = await fetch("/autenticacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password: pwd })
    });
    if (!res.ok) throw new Error("Credenciales inválidas");
    const data = await res.json();
    token = data.token;
    vendorToken = data.vendorToken;
    role  = data.role[0].toUpperCase() + data.role.slice(1);
    document.getElementById("role-display").textContent = role;
    document.getElementById("login-form").style.display = "none";
    document.getElementById("app").style.display = "block";
  } catch (e) {
    err.textContent = e.message;
  }
}

// ----------------- HELPERS -----------------

function authHeaders() {
  if (!token || !vendorToken) {
    throw new Error("No estás autenticado correctamente");
  }
  return {
    "x-authentication": token,
    "x-vendor-token":   vendorToken,
    "Content-Type":     "application/json"
  };
}

function hideAllSections() {
  formSectionEl.style.display     = "none";
  responseSectionEl.style.display = "none";
  catalogSectionEl.style.display  = "none";
  formContainerEl.innerHTML       = "";
  outputEl.textContent            = "";
}

// ----------------- CATÁLOGO -----------------
async function showProducts() {
  hideAllSections();
  catalogSectionEl.style.display = "block";

  const resApi   = await fetch("/data/articulos", { headers: authHeaders() });
  const apiArts  = (await resApi.json()).map(a => ({ ...a, source: "api" }));

  const resLocal = await fetch(`/db/productos.json?ts=${Date.now()}`);
  const locArts  = (await resLocal.json()).map(a => ({ ...a, source: "local" }));

  allArticles = [...apiArts, ...locArts];

  catalogButtonsEl.innerHTML = "";
  cardsContainerEl.innerHTML = "";

  const categories = {
    "Herramientas Manuales":   ["Martillos","Destornilladores","Llaves"],
    "Herramientas Eléctricas": ["Taladros","Sierras","Lijadoras"],
    "Materiales Básicos":      ["Cemento","Arena","Ladrillos"],
    "Acabados":                ["Pinturas","Barnices"],
    "Cerámicos":               [],
    "Equipos de Seguridad":    ["Cascos","Guantes","Lentes de Seguridad"],
    "Accesorios Varios":       [],
    "Tornillos y Anclajes":    [],
    "Fijaciones y Adhesivos":  [],
    "Equipos de Medición":     []
  };

  Object.keys(categories).forEach(cat => {
    const btn = document.createElement("button");
    btn.textContent = cat;
    btn.onclick = () => {
      currentCategory = cat;
      currentSubcats  = categories[cat];
      renderCategory(cat, categories[cat]);
    };
    catalogButtonsEl.appendChild(btn);
  });
}

function renderCategory(catName, subcats) {
  cardsContainerEl.innerHTML = "";
  
  // Filtrar artículos por categoría o subcategorías
    const filtered = allArticles.filter(article => {
    return article.categoria === catName || subcats.includes(article.categoria);
  });

  // Poner primero los productos con descuento
  filtered.sort((a, b) => {
    const aHas = a.desc && !isNaN(a.desc) && a.desc > 0;
    const bHas = b.desc && !isNaN(b.desc) && b.desc > 0;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return 0;
  });

  // Mostrar cards
  filtered.forEach(article => {
    let precioFinal = article.precio;
    if (article.desc && !isNaN(article.desc) && article.desc > 0) {
      precioFinal = Math.round(article.precio / 100 * (100 - article.desc));
    }

    // Creamos la card
    const card = document.createElement("div");
    card.className = "card";

    // Badge “new” si corresponde
    const badge = article.new === "True" || article.new === true
      ? `<div class="new-badge">new</div>`
      : "";

    card.innerHTML = `
      ${badge}
      <div class="cardNumber" style="display:none;">0</div>
      <img src="https://upload.wikimedia.org/wikipedia/commons/a/a3/Image-not-found.png" alt="Product image" />
      <h3>${article.nombre}</h3>
      <p class="marca">${article.marca || 'Sin marca'}</p>
      <p id="laid">${article.id}</p>
      <p class="stock">Stock: ${article.stock}</p>
      <div class="precio">
        ${article.desc
          ? `<p class="desc" >${article.desc}%</p>
            <p class="old-price">$${article.precio}</p>
            <p class="discounted-price">$${precioFinal}</p>`
          : `<p>$${precioFinal}</p>`
        }
      </div>
    `;

    let count = 0;
    card.addEventListener('click', () => {
      count++;

      const numberEl = card.querySelector('.cardNumber');
      numberEl.style.display = "flex";
      numberEl.textContent = count;

      card.style.animation = "scale-down-center 0.3s ease";
      
      setTimeout(() => {
        card.style.animation = "";
      }, 300);
    });

    card.addEventListener("click", () => addToCart(article));

    cardsContainerEl.appendChild(card);
  });

  // Mostrar también en la sección de respuesta
  responseSectionEl.style.display = "block";
  outputEl.textContent = JSON.stringify(filtered, null, 2);
}

// ----------------- GESTIÓN DE PRODUCTOS -----------------

async function manageProducts() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <div style="display:flex; gap:24px;">
      <div id="manage-cards" class="manageCard" ></div>
      <div id="edit-form" style="flex:1;"></div>
    </div>
  `;

  // cargo productos locales
  const resLocal = await fetch(`/db/productos.json?ts=${Date.now()}`);
  const productos = await resLocal.json();

  const cardsEl = document.getElementById("manage-cards");
  cardsEl.innerHTML = "";
  productos.forEach(prod => {
    const card = document.createElement("div");
    card.className = "card";
    let precioFinal = prod.precio;
    if (prod.desc && !isNaN(prod.desc) && prod.desc > 0) {
      precioFinal = Math.round(prod.precio / 100 * (100 - prod.desc));
    }
    card.innerHTML = `
      ${prod.new === true || prod.new === "True"? `<div class="new-badge">NEW</div>` : ""}
      <img src="https://upload.wikimedia.org/wikipedia/commons/a/a3/Image-not-found.png" alt="Product image" />
      <h3>${prod.nombre}</h3>
      <p class="marca">${prod.marca || 'Sin marca'}</p>
      <p id="laid">${prod.id}</p>
      <p class="stock">Stock: ${prod.stock}</p>
      <div class="precio">
        ${prod.desc
          ? `<p class="desc" >${prod.desc || 0}%</p>
            <p class="old-price">$${prod.precio}</p>
            <p class="discounted-price">$${precioFinal}</p>`
          : `<p>$${precioFinal}</p>`
        }
      </div>
    `;
    card.onclick = () => showEditForm(prod);
    cardsEl.appendChild(card);
  });
}

function showEditForm(prod) {
  const formEl = document.getElementById("edit-form");
  formEl.innerHTML = `
    <p><b>Editar:</b> ${prod.nombre}</p>
    <label>Descuento (%)</label>
    <input type="number" id="edit-desc" min="0" max="100" value="${prod.desc||0}" />
    <label class="labelCheckboxx">
       Nuevo:
       <input class="check" type="checkbox" id="edit-new" ${prod.new===true||prod.new==="True"?"checked":""}/>
    </label>
    <button style="margin-top:12px;" onclick="updateProduct('${prod.id}')">Actualizar</button>
    <p id="edit-status"></p>
  `;
}

async function updateProduct(id) {
  const descVal = Number(document.getElementById("edit-desc").value);
  const newVal  = document.getElementById("edit-new").checked;
  const statusEl = document.getElementById("edit-status");
  statusEl.textContent = "";

  try {
    const res = await fetch(`/data/local/articulos/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desc: descVal, new: newVal })
    });
    if (!res.ok) throw new Error("Error al actualizar, no tienes permisos para esta accion");
    const data = await res.json();
    statusEl.style.color = "green";
    allArticles = [];
    await reloadArticles();
    manageProducts();
    statusEl.textContent = "✅ Actualizado correctamente";
    const updated = (await res.json());
    showEditForm({ id, desc: descVal, new: newVal, nombre: "" });
  } catch (e) {
    statusEl.style.color = "red";
    statusEl.textContent = "❌ " + e.message;
  }
}

// ----------------------- PAGO -------------------------

let cart = [];
let currentCurrency = "CLP";

const cartContainerEl = document.getElementById("cart-container");
const cartItemsEl = document.getElementById("cart-items");
const cartTotalEl = document.getElementById("cart-total");
const currencyEl = document.getElementById("currency");
const currencySelectEl = document.getElementById("currency-select");
const payStatusEl = document.getElementById("pay-status");

currencySelectEl.addEventListener("change", async (e) => {
  currentCurrency = e.target.value;
  await updateCartDisplay();
});

function addToCart(article) {
  cart.push(article);
  cartContainerEl.style.display = "block";
  updateCartDisplay();
}

async function updateCartDisplay() {
  cartItemsEl.innerHTML = "";

  const summary = {};
  for (const item of cart) {
    if (!summary[item.id]) {
      summary[item.id] = { item, count: 0 };
    }
    summary[item.id].count++;
  }

  let totalCLP = 0;

  const calcUnitPrice = it => {
    if (it.desc && !isNaN(it.desc) && it.desc > 0) {
      return Math.round(it.precio / 100 * (100 - it.desc));
    }
    return it.precio;
  };

  Object.values(summary).forEach(({ item, count }) => {
    const unitPrice = calcUnitPrice(item);
    const lineTotal = unitPrice * count;
    totalCLP += lineTotal;

    const prefix = count > 1 ? `${count}x ` : "";
    cartItemsEl.innerHTML += `
      <div>
        <p>${prefix}${item.nombre} - $${lineTotal} CLP</p>
      </div>
    `;
  });

  if (currentCurrency === "USD") {
    try {
      const rate = await getConversionRate("CLP", "USD");
      const totalUSD = (totalCLP * rate).toFixed(2);
      cartTotalEl.textContent = totalUSD;
      currencyEl.textContent = "USD";
    } catch (err) {
      console.error(err);
      payStatusEl.textContent = "Error al convertir moneda";
    }
  } else {
    cartTotalEl.textContent = Math.round(totalCLP);
    currencyEl.textContent = "CLP";
  }
}

async function getConversionRate(from, to) {
  const res = await fetch(`/currency?code=${from}`);
  if (!res.ok) throw new Error("Error al obtener tasa de cambio");
  const { rate } = await res.json();
  return rate;
}

let stripe;

async function initStripe() {
  try {
    const res = await fetch("/config");
    const data = await res.json();
    stripe = Stripe(data.publicKey);
  } catch (e) {
    console.error("Error al obtener la clave pública de Stripe:", e);
  }
}

initStripe();

async function pay() {
  if (cart.length === 0) return alert("Carrito vacío");

  const items = cart.map(item => ({
    id:       item.id,
    name:     item.nombre,
    price:    item.precio,
    quantity: 1,
    currency: "clp"
  }));

  try {
    const response = await fetch("/createCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Error desconocido");
    window.location = data.url;
  } catch (err) {
    console.error(err);
    payStatusEl.style.color = "red";
    payStatusEl.textContent = "❌ Error al crear la sesión: " + err.message;
  }
}

// ----------------- FORMULARIOS DINÁMICOS -----------------

function showProduct() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>ID de artículo:</label>
    <input type="text" id="input-article-id" placeholder="e.j. ART001" />
    <button onclick="getProduct()">Consultar</button>
  `;
}

async function getProduct() {
  const id  = document.getElementById("input-article-id").value;
  const res = await fetch(`/data/articulos/${id}`, { headers: authHeaders() });
  const data = await res.json();
  showResponse(data);
}

function showBranch() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>ID de sucursal:</label>
    <input type="text" id="input-branch-id" placeholder="e.j. SC001" />
    <button onclick="getBranch()">Consultar</button>
  `;
}

async function getBranch() {
  const id  = document.getElementById("input-branch-id").value;
  const res = await fetch(`/data/sucursales/${id}`, { headers: authHeaders() });
  const data = await res.json();
  showResponse(data);
}

function showVendors() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>ID de sucursal:</label>
    <input type="text" id="input-branch-id" placeholder="e.j. SC001" />
    <button onclick="getVendors()">Consultar</button>
  `;
}

async function getVendors() {
  const bid  = document.getElementById("input-branch-id").value;
  const res = await fetch(`/data/vendedores/sucursal/${bid}`, { headers: authHeaders() });
  const data = await res.json();
  showResponse(data);
}

function showVendor() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>ID de vendedor:</label>
    <input type="text" id="input-vendor-id" placeholder="e.j. V001" />
    <button onclick="getVendor()">Consultar</button>
  `;
}

async function getVendor() {
  const id  = document.getElementById("input-vendor-id").value;
  const res = await fetch(`/data/vendedores/${id}`, { headers: authHeaders() });
  const data = await res.json();
  showResponse(data);
}

function addProduct() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>Categoria:</label>
      <select class="selectOptions" id="category-select">
        <option value="Herramientas Manuales">Herramientas Manuales</option>
        <option value="Materiales Básicos">Materiales Básicos</option>
        <option value="Acabados">Acabados</option>
        <option value="Cerámicos">Cerámicos</option>
        <option value="Equipos de Seguridad">Equipos de Seguridad</option>
        <option value="Accesorios Varios">Accesorios Varios</option>
        <option value="Tornillos y Anclajes">Tornillos y Anclajes</option>
        <option value="Fijaciones y Adhesivos">Fijaciones y Adhesivos</option>
        <option value="Equipos de Medición">Equipos de Medición</option>
      </select>
    <label>SubCategoria:</label>
    <input type="text" id="input-subcategory" placeholder="Adesivo" />
    <label>Marca:</label>
    <input type="text" id="input-brand" placeholder="CAT" />
    <label>Nombre:</label>
    <input type="text" id="input-name" placeholder="Scotch" />
    <label>Stock:</label>
    <input type="text" id="input-stock" placeholder="999" />
    <label>Precio:</label>
    <input type="text" id="input-price" placeholder="CLP" />
    <button onclick="sendNewProduct()">Publicar</button>
  `;
}

async function sendNewProduct() {
  const categoria = document.getElementById("category-select").value;
  const subcategoria = document.getElementById("input-subcategory").value.trim();
  const marca = document.getElementById("input-brand").value.trim();
  const nombre = document.getElementById("input-name").value.trim();
  const stock = parseInt(document.getElementById("input-stock").value, 10);
  const precio = parseInt(document.getElementById("input-price").value.replace(/[^0-9]/g, ""), 10);

  if (!subcategoria || !marca || !nombre || isNaN(stock) || isNaN(precio)) {
    return showResponse("❌ Todos los campos son requeridos y numéricos donde corresponda.");
  }

  try {
    const res = await fetch("/data/product/new", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        categoria,
        subcategoria,
        marca,
        nombre,
        stock,
        precio
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error al crear producto");

    await reloadArticles();
    showResponse(data);
  } catch (e) {
    showResponse("❌ " + e.message);
  }
}

function showOrderForm() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>ID de artículo:</label>
    <input type="text" id="input-order-article" placeholder="e.j. ART001" />
    <label>Cantidad:</label>
    <input type="number" id="input-order-qty" placeholder="e.j. 5" />
    <button onclick="placeOrder()">Enviar Pedido</button>
  `;
}

async function placeOrder() {
  const aidRaw  = document.getElementById("input-order-article").value;
  const aidTrim = aidRaw.trim();
  const aidUp = aidTrim.toUpperCase();
  const qty = parseInt(document.getElementById("input-order-qty").value, 10);

  let article = allArticles.find(a => a.id === aidTrim);

  if (!article) {
    article = allArticles.find(a => String(a.id).trim().toUpperCase() === aidUp);
  }

  if (!article) {
    return showResponse(`Artículo con ID "${aidRaw}" no encontrado.`);
  }

  let url, opts;
  if (article.source === "local") {
    url  = `/data/local/articulos/venta/${encodeURIComponent(article.id)}?cantidad=${qty}`;
    opts = { method: "PUT" };
  } else {
    url  = `/data/articulos/venta/${encodeURIComponent(article.id)}?cantidad=${qty}`;
    opts = { method: "PUT", headers: authHeaders() };
  }

  const res = await fetch(url, opts);

  let data;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = { error: await res.text() };
  }

  if (res.ok) {
    showResponse(data.message);
    await reloadArticles();
  } else {
    showResponse(data.error);
  }
  
}

async function reloadArticles() {
  const resApi   = await fetch("/data/articulos", { headers: authHeaders() });
  const apiArts  = (await resApi.json()).map(a => ({ ...a, source: "api" }));
  const resLocal = await fetch(`/db/productos.json?ts=${Date.now()}`);
  const locArts  = (await resLocal.json()).map(a => ({ ...a, source: "local" }));
  allArticles = [...apiArts, ...locArts];
}

function sendMail() {
  hideAllSections();
  formSectionEl.style.display = "block";
  formContainerEl.innerHTML = `
    <label>ID de vendedor:</label>
    <input type="text" id="input-vendor-id-mail" placeholder="e.j. V001" />
    <label>Mensaje:</label>
    <textarea class="textareavendor" id="input-vendor-message" rows="4" placeholder="Escribe tu mensaje aquí"></textarea>
    <button onclick="submitVendorMessage()">Mandar</button>
  `;
}

async function submitVendorMessage() {
  const vid = document.getElementById("input-vendor-id-mail").value.trim();
  const msg = document.getElementById("input-vendor-message").value.trim();
  if (!vid || !msg) {
    return showResponse("Debe indicar ID de vendedor y mensaje.");
  }

  try {
    const resV = await fetch(`/data/vendedores/${encodeURIComponent(vid)}`, {
      method: "GET",
      headers: authHeaders()
    });
    if (!resV.ok) {
      const err = await resV.json();
      throw new Error(err.detail || `Error al buscar vendedor ${vid}`);
    }
    const vendedor = await resV.json();
    const email = vendedor.email;
    if (!email) {
      throw new Error("El vendedor no tiene email registrado.");
    }

    const resM = await fetch("/enviarMensaje", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: email,
        subject: `Mensaje desde FERREMAS a ${vendedor.nombre || vid}`,
        message: msg
      })
    });
    const dataM = await resM.json();
    if (!resM.ok) {
      throw new Error(dataM.detail || "Error al enviar el mensaje");
    }

    showResponse(dataM.message || "Mensaje enviado correctamente");
  } catch (e) {
    showResponse(`❌ ${e.message}`);
  }
}

// ----------------- SUCURSALES -----------------

async function getBranches() {
  hideAllSections();
  const res = await fetch("/data/sucursales", { headers: authHeaders() });
  const data = await res.json();
  showResponse(data);
}

// ----------------- MUESTRA RESPUESTA -----------------
function showResponse(data) {
  formSectionEl.style.display     = "none";
  catalogSectionEl.style.display  = "none";
  responseSectionEl.style.display = "block";
  outputEl.textContent            = JSON.stringify(data, null, 2);
}