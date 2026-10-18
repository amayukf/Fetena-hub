# ExamVault — Secure Ambo University Exam Repository

ExamVault is a production-grade web application and secure archive designed specifically for first-year students at Ambo University. It enforces end-to-end security, role-based access control, server-side dynamic watermarking, anti-tamper payment verification, and an administrative paper buyback flow.

---

## 1. Quickstart: Running Locally from Zero

### Prerequisites
- **Node.js**: v22.13 or higher (or v24 or higher)
- **pnpm** or **npm**
- **Docker** (recommended for local PostgreSQL) or an existing PostgreSQL 16+ instance

### Step-by-Step Setup

```bash
# 1. Clone and navigate into directory
cd "d:/ExamVault Web App Prototype"

# 2. Install dependencies
npm install

# 3. Database:
# Note: A native PostgreSQL service is already active on port 5432 on this machine!
# (If Docker is installed, you can optionally run: docker compose up -d)

# 4. Generate Prisma Client and apply migrations & database triggers
npx prisma generate
npx prisma migrate deploy

# 5. Seed reference data (Campus, Streams, Terms, 11 Courses, Settings)
#    This command is SAFE to run multiple times — it uses upserts and never
#    changes user accounts or deletes existing data.
npm run seed

# 6. Create the initial administrator account
npm run create-admin admin@ambo.edu.et CampusAdminPassword2026!

# 7. (Optional) Seed local dev test accounts (non-production only)
#    Requires SEED_DEV_CONFIRM=yes and refuses production-looking databases.
SEED_DEV_CONFIRM=yes npm run seed:dev

# 8. Start the development server
npm run dev
```

> ⚠️ **NEVER run `npm run seed:reset` against real data.**
> `seed:reset` runs a full `TRUNCATE CASCADE` that **permanently deletes every
> student account, payment, and exam paper** in the database. It is blocked in
> `NODE_ENV=production` and requires interactive confirmation. It exists only
> for local development database resets.

App is available at: **http://localhost:8443** (or port specified in `$PORT`).

Paper viewing renders the original PDF or scan into authenticated, per-page PNGs
on the server and embeds the viewer's name, student ID, and date in each image.
The student viewer never receives the original paper file. Watermarks deter
sharing but cannot prevent screenshots or photographs.

---

## 2. Environment Variables Reference

Copy `.env.example` to `.env.local` to override settings for local development:

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:5432/examvault_db` |
| `TEST_DATABASE_URL` | Scratch database used by `npm test` (name must contain `test`, or the suites refuse to run) | `postgresql://...examvault_test_db` |
| `DIRECT_URL` | Direct connection for Prisma migrations | `postgresql://postgres:postgres@localhost:5432/examvault_db` |
| `SESSION_SECRET` | **Required.** 32+ char secret for HMAC signing; startup aborts without it | `openssl rand -base64 32` |
| `NODE_ENV` | Environment mode (`development` or `production`). `npm start` forces `production` | `development` |
| `ALLOW_ACTOR_IMPERSONATION` | Dev/test only. When not `"false"`, a non-production environment trusts the `x-actor-id` header (a full auth bypass). Always `"false"` on a real deployment | `"false"` |
| `EXAMVAULT_ALLOW_NON_PRODUCTION` | Escape hatch: set to `yes` to let `npm start` run outside production mode | unset |
| `SEED_DEV_CONFIRM` | Must be `yes` for `npm run seed:dev` to run | unset |
| `PORT` | Local server port | `8443` (dev), `8080` (`npm start`) |
| `STORAGE_PROVIDER` | `local`, `r2`, or `s3`. `r2`/`s3` **require** credentials — the server refuses to fall back to local disk | `local` |
| `S3_ENDPOINT` / `R2_ENDPOINT` | Cloudflare R2 / S3 Endpoint URL | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` / `R2_ACCESS_KEY_ID` | Storage Access Key | `xxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `S3_SECRET_ACCESS_KEY` / `R2_SECRET_ACCESS_KEY`| Storage Secret Key | `xxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `S3_BUCKET_NAME` / `R2_BUCKET_NAME` | Storage Bucket Name | `examvault-private-archive` |
| `STORAGE_BASE_DIR` | Private disk folder if S3 keys not set | `storage/` (outside web root) |

---

## 3. Creating and Managing Administrators

To provision an initial administrator or emergency backup administrator:

```bash
npm run create-admin <email> <password>
```
Example:
```bash
npm run create-admin superadmin@ambo.edu.et SecureTempPassword2026#
```
- The user is created with `role: ADMIN` and `mustChangePassword: true`.
- On their first login, the user is required to set a new password before accessing the system.
- Existing admins can also manage roles and permissions via the **Admin Dashboard > Users** screen.
- **Safety**: the script refuses to promote an account that already exists with a non-admin role, and refuses to overwrite an existing password, unless you pass `--force`. It also rejects admin passwords shorter than 12 characters.

---

## 4. Switching to Hosted PostgreSQL (Neon) and Cloudflare R2

### Switching to Neon
Switching to Neon is a **one-line change**:
1. Open `.env.local` (or environment configuration in production host).
2. Set `DATABASE_URL` to your Neon connection string:
   ```env
   DATABASE_URL="postgres://username:password@ep-xxxxxxxx.us-east-2.aws.neon.tech/examvault?sslmode=require"
   DIRECT_URL="postgres://username:password@ep-xxxxxxxx.us-east-2.aws.neon.tech/examvault?sslmode=require"
   ```
3. Run migrations then the **safe** idempotent seed:
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```
   > Do **not** run `npm run seed:reset` against a Neon database that has real data.

### Switching to Cloudflare R2 / AWS S3
Provide your R2 bucket credentials in environment variables:
```env
S3_ENDPOINT="https://<cloudflare-account-id>.r2.cloudflarestorage.com"
S3_ACCESS_KEY_ID="your-r2-access-key-id"
S3_SECRET_ACCESS_KEY="your-r2-secret-access-key"
S3_BUCKET_NAME="examvault-assets"
```
The storage adapter automatically activates Cloudflare R2/S3 storage while keeping files strictly private under `quarantine/` and `published/`.

---

## 5. Production Deployment Steps

1. **Verify Environment**:
   - `NODE_ENV=production` is **forced by `npm start`** — you do not need to set it (see below).
   - Ensure a cryptographically random `SESSION_SECRET` (minimum 32 characters) is configured.
2. **Build Application**:
   ```bash
   npm run build
   ```
3. **Run Production Server**:
   ```bash
   npm start
   ```
   `npm start` runs `server/index.ts`, which serves the built SPA from `dist/` **and** every `/api/*` route from one process, applies security headers (`HSTS`, `CSP`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`), and shuts down gracefully on `SIGTERM`/`SIGINT`.

   It **forces `NODE_ENV=production`**. Importing `@prisma/client` loads `.env`, which used to overwrite `NODE_ENV` and silently downgrade the server to development mode (impersonation enabled, insecure cookies, fail-fast checks skipped). Set `EXAMVAULT_ALLOW_NON_PRODUCTION=yes` if you genuinely need to run this entrypoint outside production.

   > Because it sends `X-Frame-Options: DENY` / `frame-ancestors 'none'`, the production server cannot be embedded in an iframe. Use the Vite dev server for the Figma preview panel.

   > `npm run preview` (`vite preview`) is a **local accessibility check only**. It is not a production server: it runs a single unclustered process with no TLS and never sets `NODE_ENV=production`, so secure cookies and the production-only fail-fast checks stay disabled.

   Before starting, confirm:
   - `SESSION_SECRET` is a real 32+ character random value (startup aborts otherwise).
   - `STORAGE_PROVIDER` is `local`, or `r2`/`s3` **with** real credentials (startup aborts otherwise).
   - `ALLOW_ACTOR_IMPERSONATION` is `"false"` (production already disables impersonation; this is belt-and-braces).

   Health check: `GET /health` (also `GET /api/health`) returns JSON with database connectivity, and responds `503` when the database is unreachable. It works on both the production server and the Vite dev server.

---

## 6. Operational Runbooks

### Runbook A: "Student paid but is locked out"
1. Navigate to **Admin Dashboard > Users**.
2. Search for the student by their email, phone number, or Student ID (e.g. `AMU-2026-xxxx`).
3. Click **Access History** to inspect:
   - Account status (must be **Active**; if suspended, click **Reactivate**).
   - Payment history: Check if their payment is **PENDING** or **REJECTED**.
4. If payment is pending: Go to **Payments Queue**, verify transaction ID against Telebirr/CBE statement, and click **Approve**. This automatically creates the active entitlement for the semester.
5. If concurrent sessions exceeded: Advise student to log out from their previous browser or mobile device (maximum 2 concurrent sessions permitted).

### Runbook B: "Payment queue is stuck or slow"
1. In **Admin Dashboard > Settings**, verify that the platform price and payment details (Telebirr Number, CBE Account Number) are correctly configured.
2. Check PostgreSQL connection health by calling `GET /health`.
3. Payment Verifiers can filter by **PENDING** payments and bulk-review receipts.
4. If a receipt image cannot be downloaded or is corrupted: Click **Reject** and provide clear instructions ("Receipt blurred; please upload clear screenshot showing Telebirr transaction code").

### Runbook C: "Suspected leaked account or credential compromise"
1. Open **Admin Dashboard > Users** and find the compromised account.
2. Click **Suspend Account** (`isActive: false`). This instantly blocks all session access and rendered paper-page requests.
3. Terminate all active sessions in the database for the user.
4. If needed, click **Block Selling** (`canSell: false`) to prevent fraudulent paper submissions.
5. Review the **Audit Log** filtered by the user's ID to trace all IP addresses, downloaded papers, and submitted transactions.

### Runbook D: "Paper must be removed urgently (Copyright / Exam Leak)"
1. Go to **Admin Dashboard > Papers Manager**.
2. Locate the paper using search or course filter (e.g. `Phys 1011`).
3. Toggle status to **HIDDEN** or click **Delete** (Soft-delete).
   - Once deleted or hidden, the server immediately denies page requests. The legacy direct-file stream endpoint always returns HTTP 410.
4. To permanently remove the asset from private storage: Delete the corresponding storage key (`published/...`) from the private storage bucket.
5. An immutable entry is automatically recorded in the cryptographic **Audit Log** detailing the deletion action, timestamp, and admin actor.
