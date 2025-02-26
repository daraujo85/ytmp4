FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    curl \
    ca-certificates \
    bash

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create directory for videos and set permissions
RUN mkdir -p /app/downloads \
    && chown -R node:node /app \
    && chmod -R 755 /app/downloads

# Use non-root user
USER node

EXPOSE 3000

CMD ["npm", "start"]