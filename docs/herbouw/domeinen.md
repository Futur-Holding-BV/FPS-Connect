# Domeinen en TLS

---

## Domeinen

| Domein | Toepassing |
|---|---|
| `connect.fps-brandpreventie.nl` | FPS Connect — interne gebruikersomgeving |
| `one.fps-brandpreventie.nl` | FPS One — klantportaal |
| `api.fps-brandpreventie.nl` | API-server (optioneel — of subpad `/api`) |

> In productie verloopt alle verkeer via één domein met padgebaseerde routing:
> `connect.fps-brandpreventie.nl/` → frontend
> `connect.fps-brandpreventie.nl/api/` → API-server

---

## DNS-instelling

Voeg de volgende DNS-records toe bij de domeinnaamregistraar:

```
Type  Naam                          Waarde
A     connect.fps-brandpreventie.nl  <server-IP>
A     one.fps-brandpreventie.nl      <server-IP>
CNAME www.fps-brandpreventie.nl      fps-brandpreventie.nl
```

Wacht na wijziging 5–60 minuten op DNS-propagatie.

---

## TLS / HTTPS

### Via Caddy (aanbevolen — automatisch TLS)

```caddyfile
# /etc/caddy/Caddyfile
connect.fps-brandpreventie.nl {
    reverse_proxy localhost:8080
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
    }
}
```

Caddy vraagt automatisch een Let's Encrypt-certificaat aan.

```bash
# Caddy installeren (Ubuntu/Debian)
apt install caddy

# Configuratie laden
systemctl reload caddy
```

### Via Nginx + Certbot

```nginx
server {
    listen 443 ssl;
    server_name connect.fps-brandpreventie.nl;

    ssl_certificate     /etc/letsencrypt/live/connect.fps-brandpreventie.nl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/connect.fps-brandpreventie.nl/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /var/www/fps-connect/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# TLS-certificaat aanvragen
certbot --nginx -d connect.fps-brandpreventie.nl

# Auto-verlenging instellen (wordt door Certbot al aangemaakt)
certbot renew --dry-run
```

---

## Sessiecookies en proxy

Omdat FPS Connect achter een reverse proxy draait, is `trust proxy` vereist
in de Express-configuratie. Dit staat al correct ingesteld.

De sessiecookie is `SameSite=None; Secure` — dit vereist altijd HTTPS.
Zonder HTTPS werkt inloggen niet.

---

## E-maildomeinen (SPF / DKIM)

Als e-mail wordt verstuurd via Microsoft Graph vanuit `fps-brandpreventie.nl`,
zorgt Microsoft 365 automatisch voor DKIM. Controleer of SPF correct is:

```
Type  Naam                    Waarde
TXT   fps-brandpreventie.nl  "v=spf1 include:spf.protection.outlook.com -all"
```

Controleer via: https://mxtoolbox.com/spf.aspx

---

## Replit-omgeving

In Replit worden domeinen automatisch ingesteld via `REPLIT_DOMAINS`.
Geen aanvullende DNS-configuratie nodig voor ontwikkeling.

Voor productie-deployments via Replit: zie **Replit Deployments → Custom Domain**
in het Replit-dashboard.
