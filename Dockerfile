# ===================================================
# Dockerfile di Produzione per Hostinger VPS / Docker
# ===================================================

# Stage 1: Build dell'applicazione
FROM node:22-alpine AS builder

WORKDIR /app

# Copia i file di specifica delle dipendenze
COPY package*.json ./

# Installa le dipendenze in modalità sicura e compatibile
RUN npm install --legacy-peer-deps

# Copia l'intero progetto (esclusi i file in .dockerignore)
COPY . .

# Compila sia l'app frontend (Vite) che il server backend (dist/server.js)
RUN npm run build

# Stage 2: Immagine runtime snella e sicura
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copia solo package*.json per installare le dipendenze essenziali di produzione
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

# Copia i file compilati dallo stage builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/metadata.json ./metadata.json

# Sicurezza: utente non-root predefinito di Node Alpine
USER node

# Espone la porta 3000
EXPOSE 3000

# Healthcheck per monitoraggio Hostinger e Docker daemon
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Avvia il server Express di produzione ottimizzato
CMD ["node", "dist/server.js"]
