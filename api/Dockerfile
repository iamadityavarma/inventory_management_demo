FROM python:3.10-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ./app ./app
# .env file will be mounted via docker-compose volume

# Create a directory for data volume and copy the CSV file
RUN mkdir -p /app/data
COPY ./app/data.csv /app/data/inventory\(in\).csv

# Expose port for Azure and add a script to use PORT env variable
EXPOSE 80
EXPOSE 8000

# Create a simple startup script
RUN echo '#!/bin/sh\n\
PORT="${PORT:-80}"\n\
echo "Starting server on port $PORT"\n\
echo "CSV file is located at: /app/data/inventory(in).csv"\n\
exec uvicorn app.main:app --host 0.0.0.0 --port $PORT\n\
' > /start.sh && chmod +x /start.sh

# Use the script as the entry point
CMD ["/start.sh"]