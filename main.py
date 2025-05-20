from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
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

API_BASE = os.getenv('API_BASE')
FIXED_TOKEN = os.getenv('FIXED_TOKEN')

# Verifica el token en el header 'x-authentication'
def verifyToken(x_authentication: str = Header(None, alias="x-authentication")) -> str:
    """
    Lee el header 'x-authentication' y verifica que coincida con FIXED_TOKEN.
    """
    if not x_authentication:
        raise HTTPException(status_code=401, detail="Missing x-authentication header")
    if x_authentication != FIXED_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")
    return x_authentication  # devolvemos el token validado

# Proxy de todos los endpoints bajo /data/*
async def proxy_get(path: str, token: str):
    headers = {"x-authentication": token}
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{API_BASE}{path}", headers=headers)
        return JSONResponse(status_code=r.status_code, content=r.json())

async def proxy_post(path: str, body: dict, token: str):
    headers = {"x-authentication": token}
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{API_BASE}{path}", json=body, headers=headers)
        return JSONResponse(status_code=r.status_code, content=r.json())

# Endpoint de autenticación
@app.post("/autenticacion", tags=["Auth"])
async def login(creds: dict):
    """Valida user/password y devuelve token + role"""
    user = creds.get("user")
    pwd  = creds.get("password")
    for u in USERS:
        if u["user"] == user and u["password"] == pwd:
            return {"token": FIXED_TOKEN, "role": u["role"]}
    raise HTTPException(status_code=401, detail="Credenciales inválidas")

# Endpoint de productos
@app.get("/data/articulos", dependencies=[Depends(verifyToken)], tags=["Articulos"])
async def get_articulos(token: str = Depends(verifyToken)):
    return await proxy_get("/data/articulos", token)

# Endpoint de un producto
@app.get("/data/articulos/{aid}", dependencies=[Depends(verifyToken)], tags=["Articulos"])
async def get_articulo(aid: str, token: str = Depends(verifyToken)):
    return await proxy_get(f"/data/articulos/{aid}", token)

# Endpoint de sucursales
@app.get("/data/sucursales", dependencies=[Depends(verifyToken)],tags=["Sucursales"])
async def get_sucursales(token: str = Depends(verifyToken)):
    return await proxy_get("/data/sucursales", token)

# Endpoint de sucursal
@app.get("/data/sucursales/{sid}", dependencies=[Depends(verifyToken)], tags=["Sucursales"])
async def get_sucursal(sid: str, token: str = Depends(verifyToken)):
    return await proxy_get(f"/data/sucursales/{sid}", token)

# Endpoint de vendedores
@app.get("/data/vendedores", dependencies=[Depends(verifyToken)],tags=["Vendedores"])
async def get_vendedor(token: str = Depends(verifyToken)):
    return await proxy_get(f"/data/vendedores", token)

# Endpoint de un vendedor
@app.get("/data/vendedores/{vid}", dependencies=[Depends(verifyToken)],tags=["Vendedores"])
async def get_vendedor(vid: str, token: str = Depends(verifyToken)):
    return await proxy_get(f"/data/vendedores/{vid}", token)

# Endpoint de agregado de venta
@app.post("/data/articulos/venta/{aid}", dependencies=[Depends(verifyToken)], tags=["Ventas"])
async def post_venta(aid: str, body: dict, token: str = Depends(verifyToken)):
    return await proxy_post(f"/data/articulos/venta/{aid}", body, token)

# Sirve la Web
@app.get("/", tags=["Web"])
async def root():
    return FileResponse("index.html")

@app.get("/styles.css", tags=["Web"])
async def css():
    return FileResponse("styles.css", media_type="text/css")

@app.get("/script.js", tags=["Web"])
async def js():
    return FileResponse("script.js", media_type="application/javascript")
