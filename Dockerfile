FROM node:24.15.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation dumb-init && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0 DATA_DIR=/data PORT=4173 PREVIEW_PORT=4174
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
EXPOSE 4173 4174
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
