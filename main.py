from fastapi import FastAPI, HTTPException, Depends, Header, Query, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
import stripe, os
import os
from dotenv import load_dotenv

app = FastAPI(
    title="API's de I. de Plataformas",
    description="Todas las API's de I. de Plataformas",
    version="1.0.0",
)

# CORS para el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Datos de usuarios hardcodeados
USERS = [
    {"user": "javier_thompson", "password": "aONF4d6aNBIxRjlgjBRRzrS", "role": "admin"},
    {"user": "ignacio_tapia", "password": "f7rWChmQS1JYfThT", "role": "maintainer"},
    {"user": "stripe_sa", "password": "dzkQqDL9XZH33YDzhmsf", "role": "service_account"},
    {"user": "Admin", "password": "1234", "role": "admin"},
]

load_dotenv()

# Variables de entorno
API_BASE = os.getenv('API_BASE')
FIXED_TOKEN = os.getenv('FIXED_TOKEN')
VENDOR_ALLOW_TOKEN = os.getenv("VENDOR_ALLOW_TOKEN")
VENDOR_DENY_TOKEN  = os.getenv("VENDOR_DENY_TOKEN")
URL = os.getenv("URL")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Info Productos para Stripe
class Item(BaseModel):
    id: str
    name: str
    price: int
    quantity: int

# Endpoint de Stripe
@app.post("/create-checkout-session")
async def create_checkout_session(items: list[Item]):
    try:
        line_items = []
        for item in items:
            line_items.append({
                "price_data": {
                    "currency": "clp", 
                    "unit_amount": item.price,
                    "product_data": {"name": item.name}
                },
                "quantity": item.quantity
            })
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=line_items,
            success_url=f"{URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{URL}/cancel"
        )
        return {"url": checkout_session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Verifica el token de autenticación
def verifyToken(
    x_authentication: str = Header(None, alias="x-authentication")
):
    """
    Sólo acepta el FIXED_TOKEN para autenticar cualquier endpoint.
    """
    if x_authentication != FIXED_TOKEN:
        raise HTTPException(403, "Token inválido")
    return x_authentication

# Verifica el token de empresa externa
def verifyVendorToken(
    x_vendor_token: str = Header(None, alias="x-vendor-token")
):
    """
    Sólo permite el VENDOR_ALLOW_TOKEN.
    """
    if x_vendor_token != VENDOR_ALLOW_TOKEN:
        raise HTTPException(403, "No tienes permiso para este recurso")
    return x_vendor_token

# Proxy de todos los endpoints bajo /data/*

async def proxyGet(path: str, token: str):
    headers = {"x-authentication": token}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{API_BASE}{path}", headers=headers)
        return JSONResponse(status_code=r.status_code, content=r.json())

async def proxyPost(path: str, body: dict, token: str):
    headers = {"x-authentication": token}
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{API_BASE}{path}", json=body, headers=headers)
        return JSONResponse(status_code=r.status_code, content=r.json())
    
async def proxyPut(path: str, headers: dict):
    async with httpx.AsyncClient() as client:
        r = await client.put(f"{API_BASE}{path}", headers=headers)
        return JSONResponse(status_code=r.status_code, content=r.json())

# Endpoint de autenticación
@app.post("/autenticacion", tags=["Auth"])
async def login(creds: dict):
    """Valida user/password y devuelve token + role"""
    user = creds.get("user")
    pwd  = creds.get("password")
    for u in USERS:
        if u["user"] == user and u["password"] == pwd:
            if u["role"] == "service_account":
                vendor_tok = VENDOR_DENY_TOKEN
            else:
                vendor_tok = VENDOR_ALLOW_TOKEN
            return {"token": FIXED_TOKEN, "role": u["role"], "vendorToken": vendor_tok}
    raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
# Endpoint de Divisas
@app.get("/convert", tags=["Divisas"])
async def convert_currency(
    from_currency: str = Query(..., min_length=3, max_length=3),
    to_currency:   str = Query(..., min_length=3, max_length=3),
):
    """
    Convierte montos entre monedas usando ExchangeRate-Host.
    Ejemplo: /convert?from_currency=CLP&to_currency=USD
    """
    url = f"https://api.exchangerate.host/convert?from={from_currency}&to={to_currency}"
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
    data = r.json()
    if not data.get("success"):
        raise HTTPException(502, "Error al obtener tasa de cambio")
    return {"rate": data["result"]}

# Endpoint de productos
@app.get("/data/articulos", dependencies=[Depends(verifyToken)], tags=["Articulos"])
async def getArticulos(token: str = Depends(verifyToken)):
    return await proxyGet("/data/articulos", token)

# Endpoint de un producto
@app.get("/data/articulos/{aid}", dependencies=[Depends(verifyToken)], tags=["Articulos"])
async def getArticulo(aid: str, token: str = Depends(verifyToken)):
    return await proxyGet(f"/data/articulos/{aid}", token)

# Endpoint de sucursales
@app.get("/data/sucursales", dependencies=[Depends(verifyToken)],tags=["Sucursales"])
async def getSucursales(token: str = Depends(verifyToken)):
    return await proxyGet("/data/sucursales", token)

# Endpoint de sucursal
@app.get("/data/sucursales/{sid}", dependencies=[Depends(verifyToken)], tags=["Sucursales"])
async def getSucursal(sid: str, token: str = Depends(verifyToken)):
    return await proxyGet(f"/data/sucursales/{sid}", token)

# Endpoint de vendedores
@app.get("/data/vendedores", dependencies=[Depends(verifyToken), Depends(verifyVendorToken)], tags=["Vendedores"])
async def getVendedor(token: str = Depends(verifyToken)):
    return await proxyGet(f"/data/vendedores", token)

# Endpoint de un vendedor
@app.get("/data/vendedores/{vid}", dependencies=[Depends(verifyToken), Depends(verifyVendorToken)], tags=["Vendedores"])
async def getVendedor(vid: str, token: str = Depends(verifyToken)):
    return await proxyGet(f"/data/vendedores/{vid}", token)

# Endpoint de agregado de venta
@app.put("/data/articulos/venta/{aid}", dependencies=[Depends(verifyToken)], tags=["Ventas"])
async def postVenta(aid: str, cantidad: int = Query(...), token: str = Depends(verifyToken)):
    return await proxyPut(f"/data/articulos/venta/{aid}?cantidad={cantidad}", headers={"x-authentication": token})

# Sirve la Web
@app.get("/", tags=["Web"])
async def HTML():
    return FileResponse("index.html")

@app.get("/styles.css", response_class=FileResponse, tags=["Web"])
async def CSS():
    return FileResponse(path="styles.css", media_type="text/css",headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"})

@app.get("/script.js", tags=["Web"])
async def JS():
    return FileResponse("script.js", media_type="application/javascript",headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0","Pragma": "no-cache"})
