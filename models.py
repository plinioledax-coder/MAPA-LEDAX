# models.py
from sqlalchemy import Column, Integer, String, Float, Date # 💡 Importe Date ou DateTime
from database import Base

class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)

    # Dados do negócio
    titulo = Column(String)
    rede = Column(String)
    tipo_cliente = Column(String)
    funil = Column(String)
    representante = Column(String)
    responsavel = Column(String)
    regiao = Column(String)
    data = Column(Date)
    # 🚨 NOVO: Valor da Venda (ou faturamento, etc.)
    valor_venda = Column(Float)

    # Endereço original vindo do Excel
    local_de_entrega = Column(String)
    endereco_cliente = Column(String)
    cidade = Column(String)
    uf = Column(String)
    cep = Column(String)

    # Debug e rastreio
    endereco_usado_geocode = Column(String)

    # Coordenadas finais
    latitude = Column(Float)
    longitude = Column(Float)
