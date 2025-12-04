# Use a imagem oficial Python 3.10
FROM python:3.10-slim

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Instala as dependências, usa --no-cache-dir para reduzir o tamanho da imagem
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação (main.py, etl.py, database.py, models.py) 
# e a pasta de dados/ (que contém o Excel e o geocache.json)
COPY . .

# Garante que a pasta 'data' exista (para o cache e o DB)
RUN mkdir -p data

# ** PASSO CRÍTICO: Executa o ETL durante a construção (BUILD TIME) **
# Isso garante que 'data/ledax.db' (com todos os clientes) e 
# 'data/geocache.json' estejam preenchidos ANTES do servidor ser iniciado.
RUN echo "Iniciando ETL para preencher o banco de dados. Isso pode levar alguns minutos na primeira vez..." && \
    python etl.py

# Porta padrão do Uvicorn
ENV PORT 8000
EXPOSE 8000

# ** PASSO FINAL: O comando de inicialização (CMD) agora apenas inicia o servidor web **
# Como o banco de dados já foi preenchido, o servidor subirá INSTANTANEAMENTE
# pronto para atender requisições, resolvendo o problema de timeout.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
