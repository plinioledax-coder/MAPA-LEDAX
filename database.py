# database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DB_DIR, exist_ok=True)

DB_PATH = os.path.join(DB_DIR, "ledax.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

print("\n===== DEBUG DATABASE.PY =====")
print("BASE_DIR:", BASE_DIR)
print("DB_DIR (esperado):", DB_DIR)
print("DB_PATH (onde o banco SERÁ criado):", DB_PATH)
print("=====================================\n")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# 🔥 AQUI ESTÁ O QUE FALTAVA
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
