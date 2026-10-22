# Guida al Deploy di puulp.it su VPS Hostinger

Questa guida descrive i passaggi per installare, configurare ed eseguire **puulp.it** sulla tua VPS Hostinger (con sistema operativo Ubuntu 22.04 / 24.04 LTS o Debian 12) per ottenere le massime prestazioni, SSL gratuito e riavvio automatico continuo.

---

## Metodo 1: Deploy Standard con Node.js + PM2 + Nginx (Consigliato)

### 1. Connettiti alla tua VPS Hostinger via SSH
Da terminale (o tramite la console web di Hostinger):
```bash
ssh root@IP_DELLA_TUA_VPS
```

### 2. Installa Node.js 22 LTS, Nginx e Certbot
Se non li hai ancora installati:
```bash
# Aggiorna i pacchetti
apt update && apt upgrade -y

# Installa Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx git

# Installa PM2 globalmente per la gestione dei processi
npm install -g pm2
```

### 3. Clona o carica il progetto sulla VPS
Crea una cartella per il sito (es. in `/var/www/puulp`):
```bash
mkdir -p /var/www/puulp
cd /var/www/puulp

# Se usi Git:
# git clone <URL_TUO_REPOSITORY> .

# Oppure carica i file del progetto via SFTP (FileZilla/Cyberduck)
```

### 4. Installa le dipendenze e compila per la produzione
```bash
cd /var/www/puulp

# Installa i pacchetti
npm ci

# Compila sia l'app React/Tailwind (in dist/) sia il server backend (in dist/server.js)
npm run build
```

### 5. Avvia l'applicazione con PM2
Utilizza il file di configurazione pre-ottimizzato `ecosystem.config.cjs` già incluso:
```bash
# Avvia in modalità produzione
pm2 start ecosystem.config.cjs --env production

# Configura il riavvio automatico al riavvio del server
pm2 save
pm2 startup
```

Puoi verificare lo stato in qualsiasi momento con:
```bash
pm2 status
pm2 logs puulp-it
```

Verifica rapida del funzionamento locale:
```bash
curl http://127.0.0.1:3000/health
# Risposta attesa: {"status":"ok","service":"puulp.it","environment":"production",...}
```

---

### 6. Configura Nginx come Reverse Proxy e Attiva SSL

1. Crea il file di configurazione per il tuo dominio:
```bash
nano /etc/nginx/sites-available/puulp.it
```

2. Incolla la seguente configurazione (sostituisci `puulp.it` con il tuo dominio se necessario):
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name puulp.it www.puulp.it;

    # Compressione Gzip per caricamento ultra-rapido
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache statica ottimizzata per asset compilati
    location /assets/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

3. Abilita il sito e testa Nginx:
```bash
ln -s /etc/nginx/sites-available/puulp.it /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

4. Genera il certificato SSL HTTPS gratuito con Certbot:
```bash
certbot --nginx -d puulp.it -d www.puulp.it
```
Segui le istruzioni a schermo. Certbot configurerà automaticamente HTTPS e il rinnovo automatico ogni 90 giorni.

---

## Metodo 2: Deploy Rapido con Docker

Se sulla tua VPS Hostinger hai installato Docker (o usi il template 1-click Docker di Hostinger):

```bash
cd /var/www/puulp

# Compila l'immagine e avvia il container in background
docker compose up -d --build

# Visualizza i log
docker compose logs -f
```

Il container espone la porta `3000` con healthcheck automatico ed è pronto per essere instradato tramite Nginx o Traefik.

---

## Comandi Utili di Manutenzione

| Operazione | Comando |
|---|---|
| Controlla stato server | `pm2 status` |
| Guarda i log in tempo reale | `pm2 logs puulp-it` |
| Riavvia l'applicazione | `pm2 restart puulp-it` |
| Aggiorna il codice | `git pull && npm install && npm run build && pm2 reload puulp-it` |
| Test salute applicazione | `curl http://127.0.0.1:3000/health` |
