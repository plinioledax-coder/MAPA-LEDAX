# etl.py
"""
ETL AUTOMATIZADO - BRASIL
- Validação Dinâmica: Compara o local achado com o centro da cidade informada no Excel.
- Cerca Virtual Inteligente: Aceita divergências pequenas (cidades vizinhas), rejeita grandes erros.
- Prioridade: BrasilAPI (Validado) → Nominatim (Rua + Cidade Excel) → Fallback.
"""

import os
import re
import time
import json
import requests
import pandas as pd
from sqlalchemy.orm import sessionmaker
from database import Base, engine, SessionLocal
from models import Cliente
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from geopy.distance import geodesic
from tqdm import tqdm

# ---------------------------
# Configurações
# ---------------------------
GEOCACHE_PATH = "data/geocache_brasil.json"
EXCEL_PATH = "data/Amostra_DB_GERAL_DEF.xlsx"
SAVE_CACHE_EVERY = 50
USER_AGENT = "ledax-mapa-brasil/3.0"

# Distância máxima aceitável entre o ponto achado e o centro da cidade (km)
# 60km cobre bem regiões metropolitanas (ex: Guarulhos -> SP) sem aceitar outro estado.
TOLERANCIA_KM = 60.0 

geolocator = Nominatim(user_agent=USER_AGENT, timeout=10)
# Rate limiter suave para não bloquear em 300 requests
geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1.2)

requests_sess = requests.Session()
requests_sess.headers.update({"User-Agent": USER_AGENT})

# ---------------------------
# Cache
# ---------------------------
def load_cache(path=GEOCACHE_PATH):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f: return json.load(f)
        except: return {}
    return {}

def save_cache(cache, path=GEOCACHE_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def chave_cache(tipo, valor):
    if not valor: return None
    return f"{tipo}::{str(valor).strip().upper()}"

GEOCACHE = load_cache()

# ---------------------------
# Helpers
# ---------------------------
def limpar_cep(cep_raw):
    if not isinstance(cep_raw, str): return None
    cep = re.sub(r"\D", "", cep_raw)
    return cep if len(cep) == 8 else None

def limpar_endereco_generico(txt):
    """Remove números e complementos para busca ampla"""
    if not isinstance(txt, str): return ""
    txt = txt.upper().strip()
    # Remove complementos
    termos = [r"\bLOJA\b", r"\bLJ\b", r"\bT[ÉE]RREO\b", r"\bSALA\b", r"\bANDAR\b", r"\bBOX\b", r"\bAPTO\b"]
    for t in termos:
        m = re.search(t, txt)
        if m: txt = txt[:m.start()]
    # Remove números no final (ex: Rua X, 123 -> Rua X)
    if "," in txt:
        parts = txt.split(",")
        # Pega a primeira parte se parecer logradouro
        txt = parts[0]
    txt = re.sub(r"\d+$", "", txt)
    return txt.strip()

# ---------------------------
# Core: Validação Geográfica
# ---------------------------
def get_coordenadas_cidade(cidade, uf):
    """
    Busca o centroide da cidade para servir de âncora.
    Ex: 'Campinas - SP' -> (-22.9, -47.0)
    """
    if not cidade or not uf: return None, None
    
    query = f"{cidade.strip()}, {uf.strip()}, Brazil"
    key = chave_cache("CITY_CENTER", query)
    
    if key in GEOCACHE:
        return GEOCACHE[key].get("lat"), GEOCACHE[key].get("lon")
    
    try:
        loc = geocode(query)
        if loc:
            GEOCACHE[key] = {"lat": loc.latitude, "lon": loc.longitude}
            return loc.latitude, loc.longitude
    except: pass
    
    GEOCACHE[key] = {"lat": None, "lon": None}
    return None, None

def validar_distancia(lat_found, lon_found, cidade_alvo, uf_alvo):
    """
    Retorna True se o ponto encontrado estiver dentro da tolerância da cidade alvo.
    Retorna True se não conseguirmos validar (fallback otimista).
    """
    if not lat_found or not lon_found: return False
    
    lat_city, lon_city = get_coordenadas_cidade(cidade_alvo, uf_alvo)
    
    # Se não achamos a cidade no mapa, não tem como validar. Aceitamos o ponto (Otimista)
    # ou rejeitamos? Melhor aceitar se confiamos na fonte, mas aqui vamos ser prudentes.
    if not lat_city: 
        return True 
        
    try:
        dist = geodesic((lat_found, lon_found), (lat_city, lon_city)).km
        return dist <= TOLERANCIA_KM
    except:
        return True

# ---------------------------
# Buscas
# ---------------------------
def buscar_brasilapi(cep):
    if not cep: return None
    key = chave_cache("BRASILAPI", cep)
    
    if key in GEOCACHE and GEOCACHE[key]: return GEOCACHE[key]
    
    try:
        r = requests_sess.get(f"https://brasilapi.com.br/api/cep/v1/{cep}", timeout=5)
        if r.status_code == 200:
            data = r.json()
            loc = data.get("location", {}).get("coordinates", {})
            lat = loc.get("latitude") or loc.get("longitude") # Fix inversão antiga v1
            lon = loc.get("longitude") or loc.get("latitude")
            
            # Fallback structure check
            if not lat and "coordinates" in data.get("location", {}):
                 lat = data["location"]["coordinates"].get("latitude")
                 lon = data["location"]["coordinates"].get("longitude")

            res = {
                "lat": float(lat) if lat else None,
                "lon": float(lon) if lon else None,
                "cidade": data.get("city"),
                "uf": data.get("state"),
                "logradouro": data.get("street", ""),
                "bairro": data.get("neighborhood", "")
            }
            GEOCACHE[key] = res
            return res
    except: pass
    
    GEOCACHE[key] = None
    return None

def buscar_nominatim(query):
    key = chave_cache("NOMINATIM", query)
    if key in GEOCACHE and GEOCACHE[key]:
        c = GEOCACHE[key]
        return c.get("lat"), c.get("lon"), c.get("address")
        
    try:
        loc = geocode(query, country_codes="br")
        if loc:
            res = {"lat": loc.latitude, "lon": loc.longitude, "address": loc.address}
            GEOCACHE[key] = res
            return loc.latitude, loc.longitude, loc.address
    except: pass
    
    GEOCACHE[key] = None
    return None, None, None

# ---------------------------
# Lógica Mestra
# ---------------------------
def geocode_inteligente(row):
    """
    Tenta achar lat/lon validando se faz sentido geográfico com a cidade do cliente.
    Blindada contra erros de tipo (float/NaN).
    """
    cep = limpar_cep(row.get("cep_do_cliente"))
    
    # --- PROTEÇÃO CONTRA O ERRO 'FLOAT' ---
    raw_endereco = row.get("endere_o_do_cliente")
    if pd.isna(raw_endereco):
        endereco = ""
    else:
        endereco = str(raw_endereco).strip() # Força virar texto
        
    cidade = row.get("cidade_do_cliente")
    uf = row.get("estado_do_cliente")
    
    # Normalização segura de Cidade e UF
    if not cidade or pd.isna(cidade): cidade = ""
    if not uf or pd.isna(uf): uf = ""
    
    # 1. TENTATIVA VIA CEP (BRASILAPI)
    if cep:
        res = buscar_brasilapi(cep)
        if res and res['lat']:
            # VALIDAÇÃO: O CEP aponta para perto da cidade do Excel?
            if validar_distancia(res['lat'], res['lon'], cidade, uf):
                return res['lat'], res['lon'], f"BrasilAPI (CEP: {cep})", cidade, uf
            else:
                # Se caiu longe, ignoramos o CEP e tentamos pelo endereço
                pass

    # 2. TENTATIVA VIA ENDEREÇO + CIDADE (NOMINATIM)
    if endereco and len(endereco) > 3 and cidade:
        # Limpa o endereço para aumentar chance de match
        rua_limpa = limpar_endereco_generico(endereco)
        
        if rua_limpa:
            query = f"{rua_limpa}, {cidade}, {uf}"
            lat, lon, addr = buscar_nominatim(query)
            
            if lat and validar_distancia(lat, lon, cidade, uf):
                 return lat, lon, "Nominatim (Endereço Completo)", cidade, uf

    # 3. TENTATIVA GENÉRICA (SÓ RUA + CIDADE)
    # Aqui estava o erro: .split() em float. Agora 'endereco' é string garantida.
    if endereco and len(endereco) > 3 and cidade:
        try:
            # Pega só a primeira parte antes da vírgula e remove números
            primeira_parte = endereco.split(',')[0] 
            rua_sem_num = re.sub(r'\d+', '', primeira_parte).strip()
            
            if len(rua_sem_num) > 3:
                query = f"{rua_sem_num}, {cidade}, {uf}"
                lat, lon, addr = buscar_nominatim(query)
                if lat and validar_distancia(lat, lon, cidade, uf):
                    return lat, lon, "Nominatim (Só Rua)", cidade, uf
        except Exception as e:
            # Se falhar o split ou regex, segue a vida sem travar
            print(f"Erro ao processar string de endereço: {e}")
            pass

    return None, None, None, cidade, uf
# ---------------------------
# ETL Main
# ---------------------------
def processar_excel(path_excel=EXCEL_PATH):
    print("📄 Lendo Excel:", path_excel)
    try:
        df = pd.read_excel(path_excel)
    except Exception as e:
        print(f"Erro ao ler arquivo: {e}")
        return

    df.columns = [re.sub(r"[^a-z0-9]+", "_", c.lower()) for c in df.columns]

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    total = len(df)
    sucessos = 0
    print(f"🚀 Processando {total} registros (Modo Brasil)...")

    for idx, row in tqdm(df.iterrows(), total=total):
        
        # Leitura dos campos
        titulo = row.get("t_tulo_do_neg_cio")
        data_raw = row.get("data")
        data_fmt = pd.to_datetime(data_raw).date() if pd.notna(data_raw) else None
        rede = row.get("rede_do_neg_cio")
        tipo = row.get("classifica_o_estrat_gico_spot_do_neg_cio")
        rep = row.get("representante_do_neg_cio")
        resp = row.get("respons_vel_do_neg_cio")
        funil = row.get("funil")
        valor = row.get("valor")
        local_entrega = row.get("local_de_entrega")
        end_cliente = row.get("endere_o_do_cliente")
        cidade_cli = row.get("cidade_do_cliente")
        uf_cli = row.get("estado_do_cliente")
        cep_raw = limpar_cep(row.get("cep_do_cliente"))

        # GEOCODING INTELIGENTE
        lat, lon, metodo, cid_final, uf_final = geocode_inteligente(row)
        
        # Mapeia região
        regiao = None
        # (Você pode reinserir o dict REGIAO_POR_UF aqui se precisar)

        cliente = Cliente(
            titulo=titulo,
            rede=rede,
            data=data_fmt,
            tipo_cliente=tipo,
            funil=funil,
            representante=rep,
            responsavel=resp,
            regiao=regiao, # Preencher se tiver logica
            valor_venda=valor,
            local_de_entrega=local_entrega,
            endereco_cliente=end_cliente,
            cidade=cid_final,
            uf=uf_final,
            cep=cep_raw,
            endereco_usado_geocode=metodo,
            latitude=lat,
            longitude=lon
        )
        db.add(cliente)

        if idx % 50 == 0:
            db.commit()
            save_cache(GEOCACHE)

    db.commit()
    save_cache(GEOCACHE)
    db.close()
    
    print("\n✅ Processo Finalizado.")
    print(f"Dados salvos no banco. Cache atualizado em {GEOCACHE_PATH}")

if __name__ == "__main__":
    processar_excel(EXCEL_PATH)