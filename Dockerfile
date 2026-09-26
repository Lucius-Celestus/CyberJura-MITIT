FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY frontend ./frontend

# data/ монтується як volume для персистентності sqlite-бази між рестартами
RUN mkdir -p /app/backend/data

WORKDIR /app/backend
EXPOSE 5000

CMD ["python", "app.py"]
