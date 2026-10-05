FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt
COPY backend backend
COPY ai ai
COPY config config
RUN mkdir -p videos/uploads videos/outputs models
CMD ["uvicorn","backend.main:app","--host","0.0.0.0","--port","8000"]
