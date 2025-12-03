# Dockerfile
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
COPY data/ /app/data/
COPY static/ /app/static/

# Porta que o Uvicorn vai usar
EXPOSE 8000

# Comando de inicialização do servidor
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]