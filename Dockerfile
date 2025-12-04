FROM python:3.11-slim

ENV PYTHONUNBUFFERED 1
ENV APP_HOME /app
WORKDIR $APP_HOME

# Cria a estrutura de pastas
RUN mkdir -p /app/data
RUN mkdir -p /app/static

# Copia as dependências e instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todos os arquivos do backend
COPY main.py .
COPY etl.py .
COPY database.py .
COPY models.py .

# COPIA DADOS E ARQUIVOS ESTÁTICOS
# Isso garante que as fontes de dados e os arquivos do mapa estejam no contêiner
# O Render ou o Docker ignoram o arquivo 'ledax.db' (se presente) e ele é recriado pelo etl.py
COPY data/ /app/data/
COPY static/ /app/static/

# Porta que o Uvicorn vai usar
EXPOSE 8000

# 🚨 CORREÇÃO PRINCIPAL AQUI:
# 1. Usa "/bin/bash", "-c" para permitir comandos sequenciais.
# 2. Executa 'python etl.py' para popular o banco de dados.
# 3. Usa '&&' para garantir que o Uvicorn SÓ inicie se o ETL for bem-sucedido.
CMD ["/bin/bash", "-c", "python etl.py && uvicorn main:app --host 0.0.0.0 --port 8000"]
