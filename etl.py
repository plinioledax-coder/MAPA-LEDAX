# etl.py
"""
ETL atualizado:
- Lê planilha real.
- Geocodifica com prioridade (local → endereço → CEP → cidade+UF → UF).
- Armazena os dados originais.
- Armazena endereço realmente usado para geocode.
- Armazena cidade/UF retornados pelo geocode.
- Usa cache persistente em data/geocache.json.
- Barra de progresso.
"""

import os
import re
import time
import json
import pandas as pd
from sqlalchemy.orm import sessionmaker
from database import Base, engine
from models import Cliente
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from tqdm import tqdm

# ---------------------------
# Config
# ---------------------------
GEOCACHE_PATH = "data/geocache.json"
EXCEL_PATH = "data/Amostra_DB_GERAL.xlsx"  # ajuste se necessário
SAVE_CACHE_EVERY = 100
USER_AGENT = "ledax-mapa-etl/1.0"

geolocator = Nominatim(user_agent=USER_AGENT, timeout=10)

# ---------------------------
# Cache helpers
# ---------------------------
def load_cache(path=GEOCACHE_PATH):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache, path=GEOCACHE_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

GEOCACHE = load_cache()

# ---------------------------
# Utilities
# ---------------------------
def limpar_cep(cep_raw):
    if not isinstance(cep_raw, str):
        return None
    cep = re.sub(r"\D", "", cep_raw)
    return cep if len(cep) == 8 else None

def chave_cache(tipo, valor):
    if not valor:
        return None
    return f"{tipo}::{valor.strip().upper()}"

def geocode_remote(query):
    """
    Retorna lat, lon, cidade_retorno, uf_retorno.
    """
    if not query:
        return None, None, None, None

    try:
        loc = geolocator.geocode(query + ", Brasil")
        if loc:
            # cidade/uf quando existirem
            city = None
            state = None
            if loc.raw and "address" in loc.raw:
                addr = loc.raw["address"]
                city = addr.get("city") or addr.get("town") or addr.get("village")
                state = addr.get("state")
            return float(loc.latitude), float(loc.longitude), city, state
    except Exception:
        pass

    return None, None, None, None


def geocode_with_priority(row):
    """
    Retorna:
    lat, lon, endereco_usado, cidade_geocode, uf_geocode
    """
    end_a_considerar = row.get("endere_o_a_considerar")
    local = row.get("local_de_entrega")
    end = row.get("endere_o_do_cliente")
    cidade = row.get("cidade_do_cliente")
    uf = row.get("estado_do_cliente")
    uf_norm = uf.strip().upper() if isinstance(uf, str) else None
    cep = limpar_cep(row.get("cep_do_cliente"))

    candidates = []
    
    if isinstance(local, str) and local.strip():
        candidates.append(("end_a_considerar", end_a_considerar.strip()))    

    if isinstance(local, str) and local.strip():
        candidates.append(("LOCAL", local.strip()))

    if isinstance(end, str) and end.strip():
        candidates.append(("END", end.strip()))

    if cep:
        candidates.append(("CEP", cep))

    if isinstance(cidade, str) and cidade.strip() and uf_norm:
        candidates.append(("CIDADE", f"{cidade.strip()} - {uf_norm}"))

    if uf_norm:
        candidates.append(("UF", uf_norm))

    # tentativas na ordem
    for tipo, valor in candidates:
        key = chave_cache(tipo, valor)

        if key in GEOCACHE:
            c = GEOCACHE[key]
            lat = c.get("lat")
            lon = c.get("lon")
            city_g = c.get("cidade_geocode")
            uf_g = c.get("uf_geocode")

            if lat and lon:
                return lat, lon, valor, city_g, uf_g
            # cache negativo → pula para próximo
            continue

        # geocode remoto
        lat, lon, city_g, uf_g = geocode_remote(valor)
        time.sleep(1)

        # grava cache mesmo que falhe
        GEOCACHE[key] = {
            "lat": lat,
            "lon": lon,
            "query": valor,
            "cidade_geocode": city_g,
            "uf_geocode": uf_g
        }

        if lat and lon:
            return lat, lon, valor, city_g, uf_g

    # nenhuma localização encontrada
    return None, None, None, None, None


# ---------------------------
# Região por UF
# ---------------------------
REGIAO_POR_UF = {
    "AC":"Norte","AP":"Norte","AM":"Norte","PA":"Norte","RO":"Norte","RR":"Norte","TO":"Norte",
    "AL":"Nordeste","BA":"Nordeste","CE":"Nordeste","MA":"Nordeste","PB":"Nordeste",
    "PE":"Nordeste","PI":"Nordeste","RN":"Nordeste","SE":"Nordeste",
    "DF":"Centro-Oeste","GO":"Centro-Oeste","MT":"Centro-Oeste","MS":"Centro-Oeste",
    "ES":"Sudeste","MG":"Sudeste","RJ":"Sudeste","SP":"Sudeste",
    "PR":"Sul","SC":"Sul","RS":"Sul"
}


# ---------------------------
# Execução do ETL
# ---------------------------
def processar_excel(path_excel=EXCEL_PATH):
    print("📄 Lendo Excel:", path_excel)
    df = pd.read_excel(path_excel)

    df.columns = [re.sub(r"[^a-z0-9]+", "_", c.lower()) for c in df.columns]

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    total = len(df)
    print(f"🚀 Importando {total} registros... (cache atual: {len(GEOCACHE)} entradas)")

    for idx, row in tqdm(df.iterrows(), total=total, desc="Processando ETL"):

        titulo = row.get("t_tulo_do_neg_cio")
        # 💡 EXTRAÇÃO DA DATA
        data_raw = row.get("data") 
        data_formatada = pd.to_datetime(data_raw).date() if pd.notna(data_raw) else None
        rede = row.get("rede_do_neg_cio")
        tipo_cliente = row.get("classifica_o_estrat_gico_spot_do_neg_cio")
        representante = row.get("representante_do_neg_cio")
        responsavel = row.get("respons_vel_do_neg_cio")
        funil = row.get("funil") # ✅ CORREÇÃO: Extrair o valor do Funil
        cidade_orig = row.get("cidade_do_cliente")
        uf_orig = row.get("estado_do_cliente")
        uf_norm = uf_orig.strip().upper() if isinstance(uf_orig, str) else None
        valor_venda_raw = row.get("valor") 
    
        # Tentativa de converter para Float, se for nulo, será None.
        valor_venda = float(valor_venda_raw) if pd.notna(valor_venda_raw) else None
        
        local_entrega = row.get("local_de_entrega")
        endereco_cliente = row.get("endere_o_do_cliente")
        cep_raw = limpar_cep(row.get("cep_do_cliente"))

        # geocoding
        lat, lon, endereco_usado, city_g, uf_g = geocode_with_priority(row)

        regiao = REGIAO_POR_UF.get(uf_norm)

        cliente = Cliente(
            titulo=titulo,
            rede=rede,
            data=data_formatada, # 💡 SALVAR NO MODELO
            tipo_cliente=tipo_cliente,
            funil=funil, # ✅ CORREÇÃO: Atribui o Funil            
            representante=representante,
            responsavel=responsavel,
            regiao=regiao,
            valor_venda=valor_venda,            # originais
            local_de_entrega=local_entrega,
            endereco_cliente=endereco_cliente,
            cidade=cidade_orig,
            uf=uf_norm,
            cep=cep_raw,

            # debug
            endereco_usado_geocode=endereco_usado,

            # coordenadas finais
            latitude=lat,
            longitude=lon
        )

        db.add(cliente)

        if (idx + 1) % 200 == 0:
            db.commit()

        if (idx + 1) % SAVE_CACHE_EVERY == 0:
            save_cache(GEOCACHE)

    db.commit()
    db.close()
    save_cache(GEOCACHE)

    print("✅ ETL concluído! Banco atualizado.")
    print(f"Cache final: {len(GEOCACHE)} entradas → salvo em {GEOCACHE_PATH}")


if __name__ == "__main__":
    processar_excel(EXCEL_PATH)
