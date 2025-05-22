let token = null;
let role = null;
let vendorToken = null;
let allArticles = [];

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

  if (!allArticles.length) {
    const res = await fetch("/data/articulos", { headers: authHeaders() });
    allArticles = await res.json();
  }
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
    btn.onclick = () => renderCategory(cat, categories[cat]);
    catalogButtonsEl.appendChild(btn);
  });
}

function renderCategory(catName, subcats) {
  cardsContainerEl.innerHTML = "";
  
  // Filtrar artículos por categoría o subcategorías
    const filtered = allArticles.filter(article => {
    return article.categoria === catName || subcats.includes(article.categoria);
  });

  // Mostrar cards
  filtered.forEach(article => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div id="cardNumber" class="cardNumber" style="display:none;">1</div>
      <img src="https://upload.wikimedia.org/wikipedia/commons/a/a3/Image-not-found.png" alt="Product image" />
      <h3>${article.nombre}</h3>
      <p class="marca">${article.marca || 'Sin marca'}</p>
      <p id="laid">${article.id}</p>
      <p class="stock">Stock: ${article.stock}</p>
      <div class="precio"><p>$${article.precio}</p></div>
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
  let total = 0;
  for (const item of cart) {
    const el = document.createElement("div");
    el.innerHTML = `<p>${item.nombre} - $${item.precio}</p>`;
    cartItemsEl.appendChild(el);
    total += item.precio;
  }

  if (currentCurrency !== "CLP") {
    try {
      const rate = await getConversionRate("CLP", currentCurrency);
      cartTotalEl.textContent = (total * rate).toFixed(2);
      currencyEl.textContent = currentCurrency;
    } catch (err) {
      console.error("Error en la conversión de moneda:", err);
      payStatusEl.textContent = "Error al convertir moneda";
    }
  } else {
    cartTotalEl.textContent = total.toFixed(2);
    currencyEl.textContent = "CLP";
  }
}

async function getConversionRate(from, to) {
  const res = await fetch(`/convert?from_currency=${from}&to_currency=${to}`);
  if (!res.ok) throw new Error("Error al obtener tasa de cambio");
  const { rate } = await res.json();
  return rate;
}

const stripe = Stripe("pk_test_51RRItsRXCXf0yPIP6ip1VXe9nwe770cc0TaOXOPH86wPgVJdl1wfuHWx8DaWO3IAMKfO0OBkwHIxhf0lpPcCyJkD00iYlMrcwV");  // Tu clave pública Stripe

async function pay() {
  if (cart.length === 0) {
    return alert("Carrito vacío");
  }

  const items = cart.map(item => ({
    id:       item.id,
    name:     item.nombre,
    price:    item.precio,
    quantity: 1
  }));

  try {
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items)
    });

    let data;
    try {
      data = await response.json();
    } catch (jsonErr) {
      throw new Error("Respuesta no JSON");
    }

    if (!response.ok) {
      throw new Error(data.detail ? JSON.stringify(data.detail) : "Error desconocido");
    }

    window.location = data.url;

  } catch (err) {
    console.error("🔥 Error al crear la sesión:", err);
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

async function showVendors() {
  const res = await fetch(`/data/vendedores`, { headers: authHeaders() });
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
  const aid = document.getElementById("input-order-article").value;
  const qty = parseInt(document.getElementById("input-order-qty").value, 10);

  const res = await fetch(
    `/data/articulos/venta/${aid}?cantidad=${qty}`,
    {
      method: "PUT",
      headers: authHeaders(),
    }
  );

  const data = await res.json();
  showResponse(data);

  await reloadArticles();
}

async function reloadArticles() {
  const res = await fetch("/data/articulos", { headers: authHeaders() });
  allArticles = await res.json();
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