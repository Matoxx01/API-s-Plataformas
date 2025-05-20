from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from dotenv import load_dotenv

app = FastAPI()

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
]

load_dotenv()

API_BASE = os.getenv('API_BASE')
FIXED_TOKEN = os.getenv('FIXED_TOKEN')

def verify_token(x_authentication: str = Header(None, alias="x-authentication")) -> str:
    """
    Lee el header 'x-authentication' y verifica que coincida con FIXED_TOKEN.
    """
    if not x_authentication:
        raise HTTPException(status_code=401, detail="Missing x-authentication header")
    if x_authentication != FIXED_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid token")
    return x_authentication  # devolvemos el token validado

@app.post("/autenticacion")
async def login(creds: dict):
    """Valida user/password y devuelve token + role"""
    user = creds.get("user")
    pwd  = creds.get("password")
    for u in USERS:
        if u["user"] == user and u["password"] == pwd:
            return {"token": FIXED_TOKEN, "role": u["role"]}
    raise HTTPException(status_code=401, detail="Credenciales inválidas")

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

@app.get("/data/articulos", dependencies=[Depends(verify_token)])
async def get_articulos(token: str = Depends(verify_token)):
    return await proxy_get("/data/articulos", token)

@app.get("/data/sucursales", dependencies=[Depends(verify_token)])
async def get_sucursales(token: str = Depends(verify_token)):
    return await proxy_get("/data/sucursales", token)

@app.get("/data/sucursales/{sid}", dependencies=[Depends(verify_token)])
async def get_sucursal(sid: str, token: str = Depends(verify_token)):
    return await proxy_get(f"/data/sucursales/{sid}", token)

@app.get("/data/articulos/{aid}", dependencies=[Depends(verify_token)])
async def get_articulo(aid: str, token: str = Depends(verify_token)):
    return await proxy_get(f"/data/articulos/{aid}", token)

@app.get("/data/vendedores/{vid}", dependencies=[Depends(verify_token)])
async def get_vendedor(vid: str, token: str = Depends(verify_token)):
    return await proxy_get(f"/data/vendedores/{vid}", token)

@app.post("/data/articulos/venta/{aid}", dependencies=[Depends(verify_token)])
async def post_venta(aid: str, body: dict, token: str = Depends(verify_token)):
    return await proxy_post(f"/data/articulos/venta/{aid}", body, token)

# Sirve el index.html y los estáticos
@app.get("/")
async def root():
    return FileResponse("index.html")

@app.get("/styles.css")
async def css():
    return FileResponse("styles.css", media_type="text/css")

@app.get("/script.js")
async def js():
    return FileResponse("script.js", media_type="application/javascript")
