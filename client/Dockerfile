# Build Stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Build the app with environment variable for production
ARG REACT_APP_API_URL=https://inventory-api-web-h9bwaheyfsg9g3bm.eastus-01.azurewebsites.net
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Debug: Create a file to verify env var is set
RUN echo "console.log('Building with REACT_APP_API_URL:', process.env.REACT_APP_API_URL)" > debug-env.js
RUN node debug-env.js

# Explicitly inject API URL into the app code to ensure it's available at runtime
RUN echo "window.API_BASE_URL = '${REACT_APP_API_URL}';" > /app/public/env-config.js

# Build the app
RUN npm run build

# Production Stage
FROM nginx:alpine

# Add bash for the startup script
RUN apk add --no-cache bash

# Copy build output from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx config and startup script
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY run.sh /run.sh

# Ensure script is executable
RUN chmod +x /run.sh

# Azure requires port 80
EXPOSE 80

# Use startup script
ENTRYPOINT ["/run.sh"]