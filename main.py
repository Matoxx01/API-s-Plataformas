from fastapi import FastAPI, HTTPException, Depends, Header, Query, Path, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel, EmailStr, validator
import stripe, os
from fastapi.staticfiles import StaticFiles
import os
import json
import smtplib
from email.message import EmailMessage
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

DB_FILE = "db/productos.json"

# Montar DB
app.mount("/db", StaticFiles(directory="db"), name="db")

load_dotenv()

# Variables de entorno
API_BASE = os.getenv('API_BASE')
FIXED_TOKEN = os.getenv('FIXED_TOKEN')
VENDOR_ALLOW_TOKEN = os.getenv("VENDOR_ALLOW_TOKEN")
VENDOR_DENY_TOKEN  = os.getenv("VENDOR_DENY_TOKEN")
URL = os.getenv("URL")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Info para Mail
class EmailRequest(BaseModel):
    to: EmailStr
    subject: str
    message: str

# Info Productos para Stripe
class Item(BaseModel):
    id: str
    name: str
    price: int
    quantity: int
    currency: str

    @validator("currency")
    def valid_currency(cls, v):
        if v not in ("clp", "usd"):
            raise ValueError("currency debe ser 'clp' o 'usd'")
        return v

# Verifica Tokens
def verifyToken(
    x_authentication: str = Header(None, alias="x-authentication")
):
    """
    Sólo acepta el FIXED_TOKEN para autenticar cualquier endpoint.
    """
    if x_authentication != FIXED_TOKEN:
        raise HTTPException(403, "Token inválido")
    return x_authentication

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
        return r.json()

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

# Endpoint de vendedores por sucursal
@app.get("/data/vendedores/sucursal/{bid}", dependencies=[Depends(verifyToken), Depends(verifyVendorToken)], tags=["Vendedores"])
async def getVendedor(bid: str, token: str = Depends(verifyToken)):
    try:
        print(f"Obteniendo vendedores para sucursal {bid}...")
        all_vendedores = await proxyGet("/data/vendedores", token)
        print(f"Respuesta de proxyGet: {all_vendedores}")

        if not isinstance(all_vendedores, list):
            raise Exception("El contenido recibido no es una lista")

        vendedores_filtrados = [v for v in all_vendedores if v.get("sucursal") == bid]
        print(f"Vendedores filtrados: {vendedores_filtrados}")
        return vendedores_filtrados

    except Exception as e:
        print(f"Error al obtener vendedores: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint de un vendedor
@app.get("/data/vendedores/{vid}", dependencies=[Depends(verifyToken), Depends(verifyVendorToken)], tags=["Vendedores"])
async def getVendedor(vid: str, token: str = Depends(verifyToken)):
    return await proxyGet(f"/data/vendedores/{vid}", token)

# Endpoint de agregado de venta
@app.put("/data/articulos/venta/{aid}", dependencies=[Depends(verifyToken)], tags=["Ventas"])
async def postVenta(aid: str, cantidad: int = Query(...), token: str = Depends(verifyToken)):
    return await proxyPut(f"/data/articulos/venta/{aid}?cantidad={cantidad}", headers={"x-authentication": token})

# Endpoint de agregado de venta local
@app.put("/data/local/articulos/venta/{aid}", tags=["Ventas"])
async def ventaLocal(
    aid: str = Path(..., description="ID del artículo local"),
    cantidad: int = Query(..., gt=0, description="Cantidad a descontar")
):
    try:
        with open(DB_FILE, "r+", encoding="utf-8") as f:
            productos = json.load(f)

            for prod in productos:
                if prod.get("id") == aid:
                    if prod["stock"] < cantidad:
                        raise HTTPException(400, "Stock insuficiente")
                    prod["stock"] -= cantidad

                    f.seek(0)
                    json.dump(productos, f, ensure_ascii=False, indent=2)
                    f.truncate()

                    return {"message": f"Venta local exitosa. Stock nuevo: {prod['stock']}"}

            raise HTTPException(404, "Artículo local no encontrado")

    except HTTPException:
        raise
    except Exception as e:
        print("Error en ventaLocal:", e)
        raise HTTPException(500, f"Error interno al procesar venta: {e}")

# Endpoint de Divisas
@app.get("/currency", tags=["Divisas"])
async def getAppnexusRate(
    code: str = Query(..., min_length=3, max_length=3, description="Código ISO de la moneda origen (ej. CLP)")
):
    """
    Devuelve la tasa CLP → USD según AppNexus (rate_per_usd).
    """
    url = f"https://api.appnexus.com/currency?code={code}&show_rate=true"
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
    data = r.json()
    resp = data.get("response", {})
    if resp.get("status") != "OK":
        raise HTTPException(status_code=502, detail="Error al consultar tasa AppNexus")
    rate_per_usd = float(resp["currency"]["rate_per_usd"])
    return {"rate": 1 / rate_per_usd}

# Endpoint de Stripe
@app.post("/createCheckoutSession", tags=["Stripe"])
async def createCheckoutSession(items: list[Item]):
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

# Endpoint de Mandado de Mail a Vendedor
@app.post("/enviarMensaje", dependencies=[Depends(verifyToken)], tags=["Mail"])
async def enviarMensaje(email_data: EmailRequest):
    gmail_user = os.getenv("GMAIL_USER")
    gmail_pass = os.getenv("GMAIL_PASS")

    msg = EmailMessage()
    msg["From"] = gmail_user
    msg["To"] = email_data.to
    msg["Subject"] = email_data.subject
    msg.set_content(email_data.message)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(gmail_user, gmail_pass)
            smtp.send_message(msg)
        return {"message": "Correo enviado exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al enviar correo: {str(e)}")
    
# Endpoint para actualizar desc y new en el JSON local
@app.put("/data/local/articulos/{aid}", tags=["Articulos"])
async def updateLocalArticle(
    aid: str = Path(..., description="ID del artículo local"),
    payload: dict = Body(...),
):
    """
    Recibe JSON { desc: int, new: bool } y actualiza el artículo en db/productos.json.
    """
    try:
        with open(DB_FILE, "r+", encoding="utf-8") as f:
            productos = json.load(f)
            found = False
            for prod in productos:
                if prod.get("id") == aid:
                    # validaciones básicas
                    desc = payload.get("desc")
                    new_flag = payload.get("new")
                    if not isinstance(desc, int) or desc < 0 or desc > 100:
                        raise HTTPException(400, "El campo 'desc' debe ser un entero entre 0 y 100")
                    if not isinstance(new_flag, bool):
                        raise HTTPException(400, "El campo 'new' debe ser booleano")
                    prod["desc"] = desc
                    prod["new"]  = new_flag
                    found = True
                    break
            if not found:
                raise HTTPException(404, "Artículo no encontrado en local")
            # sobrescribo el archivo
            f.seek(0)
            json.dump(productos, f, ensure_ascii=False, indent=2)
            f.truncate()
        return {"message": f"Artículo {aid} actualizado"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error interno: {e}")


# Sirve la Web

# HTML
@app.get("/", tags=["Web"])
async def HTML():
    return FileResponse("index.html")

# CSS
@app.get("/styles.css", response_class=FileResponse, tags=["Web"])
async def CSS():
    return FileResponse(path="styles.css", media_type="text/css",headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache"})

# JS
@app.get("/script.js", tags=["Web"])
async def JS():
    return FileResponse("script.js", media_type="application/javascript",headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0","Pragma": "no-cache"})

# Página de éxito
@app.get("/success", tags=["Web"])
async def successPage():
    return FileResponse("success.html", media_type="text/html")

# Página de cancelación
@app.get("/cancel", tags=["Web"])
async def cancelPage():
    return FileResponse("cancel.html", media_type="text/html")

# Code Stripe
@app.get("/config", tags=["Stripe"])
async def getStripePublicKey():
    public_key = os.getenv("STRIPE_PUBLISHABLE_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="Clave pública de Stripe no configurada")
    return {"publicKey": public_key}