# Guida al Deploy di puulp.it su Hostinger (Docker & VPS)

Questa guida risolve l'errore **"Distribuzione fallita"** su Hostinger e fornisce tutti i file e i passaggi pronti all'uso sia per il **Deploy Docker Automatico su Hostinger** (hPanel Docker / Git Deployment) sia per il deploy su **VPS con Docker Compose o PM2**.

---

## 🔍 Perché la distribuzione precedente su Hostinger falliva?
1. **Mancanza di `.dockerignore`**: Senza `.dockerignore`, Hostinger copiava l'intera cartella locale `node_modules` nel container, creando incompatibilità di architettura binaria con l'ambiente Linux Alpine.
2. **`npm ci` senza `package-lock.json`**: Il comando `npm ci` richiede tassativamente un file `package-lock.json` generato. Ora `package-lock.json` è presente e `Dockerfile` utilizza `npm install --legacy-peer-deps` per garantire una compilazione solida senza blocchi da peer dependencies.
3. **Mancanza di gestione porte e healthcheck**: Hostinger monitora lo stato del container; ora il Dockerfile include l'istruzione `HEALTHCHECK` su `/health` e le porte standard `3000`.

---

## 🚀 Metodo 1: Deploy Diretto su Hostinger con Docker (hPanel o Git)

I file necessari sono già pronti nella radice del progetto:
- `Dockerfile` (ottimizzato multi-stage con Node.js 22 Alpine, non-root user e healthcheck)
- `docker-compose.yml` (porte 3000:3000, riavvio automatico e logging sicuro)
- `.dockerignore` (esclusione di cache e file non necessari)
- `package-lock.json` (dipendenze bloccate e compatibili)

### Parametri da inserire nel pannello Hostinger (se richiesti):
| Parametro | Valore |
|---|---|
| **Porta dell'applicazione (Port)** | `3000` |
| **Dockerfile path** | `Dockerfile` |
| **Health Check Path** | `/health` (oppure `/api/health`) |
| **Comando di avvio (se richiesto)** | `node dist/server.js` |
| **Variabili d'ambiente (Environment Variables)** | `NODE_ENV=production` , `PORT=3000` |

---

## 💻 Metodo 2: Deploy su VPS Hostinger con Docker Compose

Se accedi alla tua VPS Hostinger via SSH:

### 1. Connettiti alla VPS
```bash
ssh root@IP_DELLA_TUA_VPS
```

### 2. Entra nella cartella del progetto
```bash
cd /var/www/puulp
```

### 3. Avvia il container Docker
```bash
docker compose up -d --build
```

### 4. Verifica lo stato e i log
```bash
docker compose ps
docker compose logs -f
```

### 5. Verifica che risponda
```bash
curl http://127.0.0.1:3000/health
# Risposta: {"status":"ok","service":"puulp.it","environment":"production"}
```

---

## 🌐 Metodo 3: Deploy VPS con Node.js + PM2 + Nginx

Se preferisci eseguire l'app direttamente su Node.js senza Docker:

```bash
cd /var/www/puulp
npm install --legacy-peer-deps
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

### Configurazione Reverse Proxy Nginx (con SSL gratuito)
In `/etc/nginx/sites-available/puulp.it`:
```nginx
server {
    listen 80;
    server_name puulp.it www.puulp.it;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Poi attiva SSL:
```bash
certbot --nginx -d puulp.it -d www.puulp.it
```
