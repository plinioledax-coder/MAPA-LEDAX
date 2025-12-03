# main.py
from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import or_ # 🚨 NOVO: Importa 'or_' para combinar filtros LIKE
from database import SessionLocal
from models import Cliente
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse # 🚨 NOVO: Importa para servir o index.html
from datetime import date
from typing import Optional, List

app = FastAPI(title="LEDAX MAPA API")

# -------------------------------
# 1. Configurações Iniciais
# -------------------------------

# CORS - libera acesso ao front
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Monta o diretório 'static'
# Arquivos estáticos serão servidos em /static/
app.mount("/static", StaticFiles(directory="static"), name="static")

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------------------
# 2. ENDPOINT RAIZ (/) - SERVIR O MAPA HTML
# -------------------------------
@app.get("/", response_class=FileResponse)
async def serve_map_index():
    """
    Serve o arquivo index.html que contém o mapa, na rota raiz (/).
    """
    # Assumimos que o index.html está em 'static/index.html'
    return FileResponse("static/index.html")

# -------------------------------
# 3. FUNÇÃO AUXILIAR PARA FILTROS
# -------------------------------

# Função auxiliar para aplicar todos os filtros em uma query base
def apply_filters_to_query(query, rede, tipo_cliente, funil, representante, regiao, responsavel, data_inicio, data_fim, busca_texto):

    # -----------------------------
    # 1. Filtros de Seleção (in_)
    # -----------------------------
    if rede:
        query = query.filter(Cliente.rede.in_(rede)) if isinstance(rede, list) else query.filter(Cliente.rede == rede)
    if tipo_cliente:
        query = query.filter(Cliente.tipo_cliente.in_(tipo_cliente)) if isinstance(tipo_cliente, list) else query.filter(Cliente.tipo_cliente == tipo_cliente)
    if funil:
        query = query.filter(Cliente.funil.in_(funil)) if isinstance(funil, list) else query.filter(Cliente.funil == funil)
            
    # Filtros de Seleção Única
    if representante:
        query = query.filter(Cliente.representante == representante)
    if regiao:
        query = query.filter(Cliente.regiao == regiao)
    if responsavel:
        query = query.filter(Cliente.responsavel == responsavel)

    # Filtros de Data
    if data_inicio:
        query = query.filter(Cliente.data >= data_inicio)
    if data_fim:
        query = query.filter(Cliente.data <= data_fim)

    # -----------------------------
    # 2. Filtro de Busca por Texto (LIKE)
    # -----------------------------
    if busca_texto:
        termo = f"%{busca_texto.upper()}%"
        # Combina a busca em múltiplos campos usando or_ (OR lógico)
        query = query.filter(
            or_(
                Cliente.titulo.ilike(termo), # Busca case-insensitive
                Cliente.endereco_cliente.ilike(termo),
                Cliente.local_de_entrega.ilike(termo),
                Cliente.endereco_usado_geocode.ilike(termo),
                Cliente.cidade.ilike(termo),
                Cliente.uf.ilike(termo),
                Cliente.rede.ilike(termo),
            )
        )

    return query


# -------------------------------
# 4. ENDPOINT /filtros - Filtros dinâmicos e Cascata
# -------------------------------
@app.get("/filtros")
def get_filtros(
    # Filtros que impactam a cascata
    rede: Optional[List[str]] = Query(None),
    tipo_cliente: Optional[List[str]] = Query(None),
    funil: Optional[List[str]] = Query(None),
    representante: Optional[str] = Query(None),
    regiao: Optional[str] = Query(None),
    responsavel: Optional[str] = Query(None),
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    # Adiciona o campo de busca aqui para afetar a cascata
    busca_texto: Optional[str] = Query(None), 
    db: Session = Depends(get_db)
):
    
    # 1. Aplica todos os filtros recebidos para criar a query base
    base_query = db.query(Cliente)
    # Passa o novo filtro de busca
    base_query = apply_filters_to_query(base_query, rede, tipo_cliente, funil, representante, regiao, responsavel, data_inicio, data_fim, busca_texto)

    # 2. Função para obter valores únicos baseados na query filtrada
    def uniq_filtered(col):
        # Seleciona o valor da coluna, mas filtra pelos clientes da base_query
        vals = base_query.with_entities(getattr(Cliente, col)).distinct().all()
        return sorted([v[0] for v in vals if v[0]])

    # 3. Retorna as listas de valores únicos
    return {
        "rede": uniq_filtered("rede"),
        "tipo_cliente": uniq_filtered("tipo_cliente"),
        "funil": uniq_filtered("funil"),
        "representante": uniq_filtered("representante"),
        "regiao": uniq_filtered("regiao"),
        "responsavel": uniq_filtered("responsavel"),
        "regional": [], 
    }


# -------------------------------
# 5. ENDPOINT /clientes/filtrar - Filtragem principal
# -------------------------------
@app.get("/clientes/filtrar")
def filtrar(
    # Filtros de seleção múltipla (mantido como List[str])
    rede: Optional[List[str]] = Query(None),
    tipo_cliente: Optional[List[str]] = Query(None),
    funil: Optional[List[str]] = Query(None),
    
    # Filtros de seleção única
    representante: Optional[str] = Query(None),
    regiao: Optional[str] = Query(None),
    responsavel: Optional[str] = Query(None),
    
    # Filtros de data
    data_inicio: Optional[date] = Query(None, description="Data de início (YYYY-MM-DD)"),
    data_fim: Optional[date] = Query(None, description="Data de fim (YYYY-MM-DD)"),
    
    # Campo de busca de texto
    busca_texto: Optional[str] = Query(None, description="Busca genérica por título, cidade, endereço, etc."),
    
    db: Session = Depends(get_db)
):
    query = db.query(Cliente)
    # Passa o novo filtro de busca
    query = apply_filters_to_query(query, rede, tipo_cliente, funil, representante, regiao, responsavel, data_inicio, data_fim, busca_texto)
    return query.all()

# -------------------------------
# 6. ENDPOINT /clientes - Todos os clientes
# -------------------------------
@app.get("/clientes")
def get_clientes(db: Session = Depends(get_db)):
    return db.query(Cliente).all()
