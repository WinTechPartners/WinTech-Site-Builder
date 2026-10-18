FROM ghcr.io/puppeteer/puppeteer:23.11.1
USER root
RUN apt-get update && apt-get install -y curl ca-certificates xz-utils && curl -fsSL https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0 DATA_DIR=/data PORT=4173 PREVIEW_PORT=4174
ENV CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
EXPOSE 4173 4174
CMD ["node", "src/server.js"]
