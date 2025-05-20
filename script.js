let token = null;
let role = null;
const output = document.getElementById("output");

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
    function capitalize(str) {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
    token = data.token;
    role  = capitalize(data.role);
    document.getElementById("role-display").textContent = role;
    document.getElementById("login-form").style.display = "none";
    document.getElementById("app").style.display = "block";
  } catch (e) {
    err.textContent = e.message;
  }
}

// ----------------- HELPERS -----------------
function authHeaders() {
  if (!token) throw new Error("No estás autenticado");
  return { "x-authentication": token };
}
function showResponse(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

// ----------------- LLAMADAS API -----------------
async function getCatalog() {
  const res = await fetch("/data/articulos", { headers: authHeaders() });
  showResponse(await res.json());
}

async function getBranches() {
  const res = await fetch("/data/sucursales", { headers: authHeaders() });
  showResponse(await res.json());
}

async function getVendorsByBranch() {
  const id = prompt("ID de sucursal:");
  const res = await fetch(`/data/sucursales/${id}`, { headers: authHeaders() });
  showResponse(await res.json());
}

async function getProduct() {
  const id = prompt("ID de artículo:");
  const res = await fetch(`/data/articulos/${id}`, { headers: authHeaders() });
  showResponse(await res.json());
}

async function getVendor() {
  const id = prompt("ID de vendedor:");
  const res = await fetch(`/data/vendedores/${id}`, { headers: authHeaders() });
  showResponse(await res.json());
}

async function placeOrder() {
  const aid = prompt("ID de artículo:");
  const qty = parseInt(prompt("Cantidad:"), 10);
  const body = { sucursal: prompt("ID sucursal:"), articulo: aid, cantidad: qty };
  const res = await fetch(`/data/articulos/venta/${aid}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  showResponse(await res.json());
}