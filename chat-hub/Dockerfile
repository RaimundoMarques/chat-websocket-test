# Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY db ./db
COPY servidor.py .

EXPOSE 8765

CMD ["python", "-m", "app"]
