# syntax=docker/dockerfile:1
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
# The model (1.5 GB) downloads into the models volume on first start.
ENV HF_HOME=/models PYTHONUNBUFFERED=1 TOKENIZERS_PARALLELISM=false
RUN mkdir -p /models && chown nobody /models
USER nobody
EXPOSE 8000
CMD ["python", "server.py"]
