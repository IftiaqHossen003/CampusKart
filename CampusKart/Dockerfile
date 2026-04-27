FROM python:3.12-slim

# Metadata
LABEL maintainer="CampusKart Team"

# Env
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache friendly)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy project
COPY . .

# Create log dir
RUN mkdir -p /app/logs

# Default port
EXPOSE 8000

# Entrypoint is overridden per-service in docker-compose.yml
CMD ["gunicorn", "CampusKart.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4"]
