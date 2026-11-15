# Stay Tuned, public copy (Render or Hugging Face): the host serves the API and the front end on one port.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    CLOUD=1 \
    PHOTON_IMESSAGE=off \
    WIKI_AGENT=off \
    HF_HOME=/app/.cache \
    FASTEMBED_CACHE_PATH=/app/.cache/fastembed

RUN useradd -m -u 1000 user
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Download the embedding model at build time, so the first visitor doesn't wait for it.
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"

COPY backend backend
COPY frontend frontend
RUN chown -R user /app
USER user

WORKDIR /app/backend
# Render passes the port in $PORT; Hugging Face uses 7860.
EXPOSE 7860
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}"]
