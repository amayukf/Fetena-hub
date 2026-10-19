<p align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Fetena Hub Logo" />
</p>

<h1 align="center">🎓 Fetena Hub</h1>

<p align="center">
  <strong>The Official Past Examination Archive & Study Platform for Ambo University Students</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8.0-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite 8" />
  <img src="https://img.shields.io/badge/Prisma-6.19-2D3748?style=flat&logo=prisma&logoColor=white" alt="Prisma ORM" />
  <img src="https://img.shields.io/badge/PostgreSQL-16+-336791?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Cloudflare_R2-S3_Compatible-F38020?style=flat&logo=cloudflare&logoColor=white" alt="Cloudflare R2" />
  <img src="https://img.shields.io/badge/Tests-132%20Passing-success" alt="Vitest 100% Passing" />
</p>

---

## 📖 Overview

**Fetena Hub** is a secure, high-performance web application purpose-built for Ambo University students. It provides verified, digitized access to historical freshman examination papers across **Natural Science** and **Social Science** streams.

Engineered specifically for low-bandwidth campus mobile networks (2G/3G), Fetena Hub features server-side dynamic watermarking, automated database housekeeping, Google OAuth 2.0 integration, Telebirr/CBE payment verification, and an administrative paper buyback flow.

---

## ✨ Key Features

### 📱 Ultra-Lightweight & Mobile-First
* **Optimized Initial Payload**: Code-split with `React.lazy()` — main student bundle is just **~51 kB gzipped**.
* **Instant Page Streaming**: High-throughput single-pass page rendering with canvas rasterization.
* **Network Resilience**: Automatic exponential-backoff retries for transient campus network hiccups.

### 🔐 Server-Side Dynamic Watermarking
* **Anti-Redistribution Engine**: Students view papers exclusively through an authenticated, canvas-rendered viewer.
* **Cryptographic Watermark**: Every page embeds the student's legal full name, student ID, and access timestamp directly onto the image raster to deter unauthorized leaks and commercial resale.

### 🔑 Flexible Authentication & Role Separation
* **Google OAuth 2.0**: One-click Google sign-in and account creation alongside student ID/phone login.
* **Strict RBAC Separation**: Dedicated roles for `STUDENT`, `PAYMENT_VERIFIER`, `CONTENT_MANAGER`, and `ADMIN`.
* **Immutability & Safety**: Append-only PostgreSQL audit log protected by database triggers.

### 💰 Paper Buyback & Payment Verification
* **Sell-to-Admin**: Students can photograph or scan past exams and sell them to Fetena Hub for direct Telebirr/CBE cash payouts.
* **Payment Verifier Desk**: Admin tools to verify Telebirr & CBE Birr receipts, unlock semester access, or reject invalid screenshots with structured feedback.

---

## 🏗️ System Architecture

```
                       ┌─────────────────────────┐
                       │   Fetena Hub React SPA  │
                       │  (Vite 8 + Tailwind CSS)│
                       └────────────┬────────────┘
                                    │ HTTP / HTTPS
                                    ▼
                       ┌─────────────────────────┐
                       │   Unified Node Server   │
                       │  (server/index.ts:8080) │
                       └─────┬─────────────┬─────┘
                             │             │
              Prisma ORM     │             │ Private S3 API
                             ▼             ▼
                 ┌───────────────┐     ┌──────────────────────┐
                 │  PostgreSQL   │     │ Cloudflare R2 / S3   │
                 │  (v14+ Neon)  │     │ (Encrypted Archive)  │
                 └───────────────┘     └──────────────────────┘
```

---

## 🚀 Quickstart: Local Development

### 1. Prerequisites
* **Node.js**: `v22.x` or higher
* **npm** or **pnpm**
* **PostgreSQL**: Local service on port `5432` or a remote connection (e.g. Neon, Supabase)

### 2. Setup
```bash
# 1. Clone the repository
git clone https://github.com/amayukf/Fetena-hub.git
cd Fetena-hub

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials and a 32+ char SESSION_SECRET

# 4. Apply database migrations
npx prisma migrate deploy

# 5. Seed baseline reference data (Campus, Programs, Semesters, Courses)
npm run seed

# 6. Provision the primary system administrator account
npm run create-admin admin@ambo.edu.et "StrongPassword2026!"

# 7. Start the development server
npm run dev
```

The app will be live at `http://localhost:8443` (or the configured `$PORT`).

---

## 🧪 Testing & Code Quality

Fetena Hub is backed by an automated 132-test Vitest suite covering authentication, RBAC boundaries, payment approvals, server rendering, and database triggers.

```bash
# Run the entire test suite
npm test

# Run strict TypeScript typechecks across client & server
npm run typecheck

# Build the production bundle
npm run build
```

---

## 🌐 Production Deployment

### 1. Production Start
```bash
npm run build
npm start
```
`npm start` launches [server/index.ts](file:///server/index.ts), which forces `NODE_ENV=production`, binds security headers (`HSTS`, `CSP`, `X-Content-Type-Options: nosniff`), serves the compiled SPA from `dist/`, and handles all `/api/*` endpoints.

### 2. Docker Deployment
A production-ready multi-stage [Dockerfile](file:///Dockerfile) is included:
```bash
# Build the container
docker build -t fetena-hub:latest .

# Run with environment file
docker run -d \
  --name fetena-hub \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  fetena-hub:latest
```

### 3. Cloudflare R2 Storage Setup
1. Log in to the Cloudflare Dashboard and navigate to **R2 Object Storage**.
2. Create a bucket named `fetenahub-private-storage`.
3. Create an API token with **Object Read & Write** permissions.
4. Set the following variables in `.env`:
   ```env
   STORAGE_PROVIDER="r2"
   S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
   S3_REGION="auto"
   S3_ACCESS_KEY_ID="your_r2_access_key_id"
   S3_SECRET_ACCESS_KEY="your_r2_secret_access_key"
   S3_BUCKET_NAME="fetenahub-private-storage"
   ```

Refer to [DEPLOYMENT.md](file:///DEPLOYMENT.md) for Nginx configuration, SSL certificates, and process manager setups.

---

## 🔒 Security Principles

* **No Plaintext Passwords**: Hashed with bcrypt (10 rounds).
* **Mandatory Initial Password Rotation**: Newly provisioned staff accounts must set a confidential password upon first login.
* **Anti-Impersonation**: `ALLOW_ACTOR_IMPERSONATION` is strictly disabled in production.
* **Session Secret Enforcement**: Server fails fast on boot if `SESSION_SECRET` is missing, short, or placeholder.
* **Rate-Limiting**: IP and account-level throttling on login, upload, and payment submissions.
* **Audit Trail**: Every administrative action, approval, and payout is logged to an immutable table.

---

## 📜 License & Copyright

© 2026 **Fetena Hub** · Ambo University. All rights reserved.
Developed for the undergraduate academic community of Ambo University.
