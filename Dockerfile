# Multi-stage Dockerfile ottimizzato per Hostinger VPS
# Base Node.js 22 Alpine (leggero e sicuro)
FROM node:22-alpine AS builder

WORKDIR /app

# Copia definizioni delle dipendenze
COPY package*.json ./

# Installa tutte le dipendenze per la compilazione
RUN npm ci

# Copia il codice sorgente
COPY . .

# Compila l'applicazione client e il server di produzione
RUN npm run build

# Stage 2: Runner di Produzione
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Installa solo le dipendenze di produzione
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia i file compilati dallo stage precedente
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/metadata.json ./metadata.json

# Utente non-root per massima sicurezza
USER node

EXPOSE 3000

# Healthcheck per Docker e Hostinger
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Avvia il server di produzione compilato
CMD ["node", "dist/server.js"]
