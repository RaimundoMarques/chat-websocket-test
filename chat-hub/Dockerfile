# Dockerfile
# Imagem base Python
FROM python:3.11-slim

# Define diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos do projeto
COPY requirements.txt .
COPY servidor.py .

# Instala dependências
RUN pip install --no-cache-dir -r requirements.txt

# Expõe a porta 8765 (WebSocket)
EXPOSE 8765

# Comando para iniciar o servidor
CMD ["python", "servidor.py"]
