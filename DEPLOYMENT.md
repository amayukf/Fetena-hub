# Fetena Hub — Production Deployment Guide

This guide details the complete, step-by-step process for deploying **Fetena Hub** to production environments (Ubuntu/Debian VPS, Docker, Render, Railway, or Fly.io).

---

## 1. System Architecture

Fetena Hub is designed as a unified, high-performance service:
* **Backend**: Node.js HTTP server ([server/index.ts](file:///server/index.ts)) serving `/api/*` and the `/health` endpoint.
* **Frontend**: Optimized React SPA compiled to static assets ([dist/](file:///dist/)) with lazy-loaded administrative routes and asset compression.
* **Database**: PostgreSQL (v14+) with Prisma ORM and immutable cryptographic audit logging triggers.
* **Storage**: Encrypted local directory or S3-compatible object store (Cloudflare R2, AWS S3) for PDF exams and payment receipts.

---

## 2. Environment Variables Checklist

Before starting the server in production, configure the `.env` file on your server. Use [.env.example](file:///.env.example) as the reference:

| Variable | Required | Description / Example |
| :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | Set to `"production"`. Enforces secure cookies, disables actor impersonation, and activates security headers. |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string: `postgresql://user:password@host:5432/fetenahub_db?schema=public` |
| `SESSION_SECRET` | **Yes** | Cryptographic key of 32+ characters: `openssl rand -base64 32` |
| `PORT` | Optional | Port for the HTTP server (defaults to `8080`). |
| `HOST` | Optional | Bind host (defaults to `0.0.0.0`). |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth 2.0 Client ID for Google login and signup. |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Matching Client ID exposed to the client bundle. |
| `STORAGE_PROVIDER` | **Yes** | `"local"`, `"r2"`, or `"s3"`. |
| `PERSISTENT_STORAGE_PATH` | If local | Absolute path on server for file uploads, e.g. `/var/data/fetenahub/storage`. |
| `S3_ENDPOINT` | If S3/R2 | S3 API endpoint (e.g., `https://<account_id>.r2.cloudflarestorage.com`). |
| `S3_ACCESS_KEY_ID` | If S3/R2 | Access Key ID. |
| `S3_SECRET_ACCESS_KEY` | If S3/R2 | Secret Access Key. |
| `S3_BUCKET_NAME` | If S3/R2 | Bucket name (e.g., `fetenahub-private-storage`). |
| `ALLOW_ACTOR_IMPERSONATION` | **Yes** | Must be `"false"` in production. |

---

## 3. Deployment Methods

### Option A: Standard VPS (Ubuntu / Debian with PM2 or systemd)

#### Step 1: Install Dependencies
```bash
sudo apt update && sudo apt install -y nodejs npm postgresql git openssl
sudo npm install -g pnpm pm2
```

#### Step 2: Clone & Install Project
```bash
git clone <your-repo-url> /var/www/fetenahub
cd /var/www/fetenahub
npm install
```

#### Step 3: Run Database Migrations & Reference Seed
```bash
# 1. Apply schema migrations
npx prisma migrate deploy

# 2. Seed academic programs, semesters, and courses
npm run seed

# 3. Provision the primary system administrator account
npm run create-admin admin@ambo.edu.et "StrongPassword2026!"
```

#### Step 4: Build Client Assets
```bash
npm run build
```

#### Step 5: Start Service with PM2
```bash
pm2 start npm --name "fetena-hub" -- start
pm2 save
pm2 startup
```

---

### Option B: Docker Container Deployment

#### Step 1: Build Image
```bash
docker build -t fetena-hub:latest .
```

#### Step 2: Run Migrations & Container
```bash
# Run database migrations using a temporary container:
docker run --rm --env-file .env fetena-hub:latest npx prisma migrate deploy

# Seed baseline academic records:
docker run --rm --env-file .env fetena-hub:latest npm run seed

# Start the main container:
docker run -d \
  --name fetena-hub \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  -v /var/data/fetenahub/storage:/var/data/fetenahub/storage \
  fetena-hub:latest
```

---

## 4. Production Nginx Reverse Proxy & SSL Configuration

Create an Nginx configuration file at `/etc/nginx/sites-available/fetenahub.conf`:

```nginx
server {
    listen 80;
    server_name fetenahub.ambo.edu.et;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fetenahub.ambo.edu.et;

    ssl_certificate /etc/letsencrypt/live/fetenahub.ambo.edu.et/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fetenahub.ambo.edu.et/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
```

Enable the configuration and obtain SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/fetenahub.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d fetenahub.ambo.edu.et
```

---

## 5. Health Check & Monitoring

Fetena Hub includes an integrated health probe for load balancers and container orchestrators:

* **Endpoint**: `GET /health`
* **Success Response (HTTP 200)**:
  ```json
  {
    "status": "ok",
    "database": "connected",
    "storage": "ready",
    "timestamp": "2026-10-19T19:12:22.582Z",
    "uptime": 25.03
  }
  ```
* If PostgreSQL becomes unreachable or storage fails, the endpoint returns an HTTP 503 so traffic is immediately routed away from unhealthy instances.

---

## 6. Pre-Flight Verification Checklist

Before opening the platform to students:

- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm test` passes 100% green across all 15 test suites.
- [ ] `npm run build` succeeds and produces the `dist/` directory.
- [ ] Database migrations are up to date (`npx prisma migrate status`).
- [ ] Base academic records are seeded (`npm run seed`).
- [ ] Primary administrator is created (`npm run create-admin`).
- [ ] `ALLOW_ACTOR_IMPERSONATION="false"` in the production `.env`.
- [ ] `SESSION_SECRET` is set to a secure, unique 32+ character string.
- [ ] HTTPS is active and enforced with valid SSL certificate.
