# ExamVault — Secure Ambo University (Woliso Campus) Exam Repository

ExamVault is a production-grade web application and secure archive designed specifically for first-year students at Ambo University (Woliso Campus). It enforces end-to-end security, role-based access control, server-side dynamic watermarking, anti-tamper payment verification, and an administrative paper buyback flow.

---

## 1. Quickstart: Running Locally from Zero

### Prerequisites
- **Node.js**: v20 or higher
- **pnpm** or **npm**
- **Docker** (recommended for local PostgreSQL) or an existing PostgreSQL 16+ instance

### Step-by-Step Setup

```bash
# 1. Clone and navigate into directory
cd "d:/ExamVault Web App Prototype"

# 2. Install dependencies
npm install

# 3. Start local PostgreSQL via Docker Compose
docker compose up -d

# 4. Generate Prisma Client and apply migrations & database triggers
npx prisma generate
npx prisma migrate deploy

# 5. Seed reference data (Campus WOLISO, Streams, Terms, 11 Courses, Settings)
npm run seed

# 6. Create the initial administrator account
npm run create-admin admin@ambo.edu.et CampusAdminPassword2026!

# 7. Start the development server
npm run dev
```

App is available at: **http://localhost:8443** (or port specified in `$PORT`).

---

## 2. Environment Variables Reference

Copy `.env.example` to `.env.local` to override settings for local development:

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:postgres@localhost:5432/examvault_db` |
| `DIRECT_URL` | Direct connection for Prisma migrations | `postgresql://postgres:postgres@localhost:5432/examvault_db` |
| `SESSION_SECRET` | 32+ char secret for HMAC signing & viewer tickets | `examvault-super-secure-production-secret-min-32-chars` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `PORT` | Local server port | `8443` |
| `ADMIN_EMAIL` | Optional initial admin email on startup | `admin@ambo.edu.et` |
| `ADMIN_INITIAL_PASSWORD` | Optional initial admin password | `AdminStrongPassword2026!` |
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
npm run create-admin superadmin@woliso.edu.et SecureTempPassword2026#
```
- The user is created with `role: ADMIN` and `mustChangePassword: true`.
- On their first login, the user is required to set a new password before accessing the system.
- Existing admins can also manage roles and permissions via the **Admin Dashboard > Users** screen.

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
3. Run migrations and seed:
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```

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
   - Ensure `NODE_ENV=production`
   - Ensure a cryptographically random `SESSION_SECRET` (minimum 32 characters) is configured.
2. **Build Application**:
   ```bash
   npm run build
   ```
3. **Run Production Server**:
   ```bash
   npm run preview
   ```
   *In production, security headers (`HSTS`, `CSP`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`), secure cookies (`HttpOnly; Secure; SameSite=Strict`), and strict rate limiting are automatically active.*

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
2. Click **Suspend Account** (`isActive: false`). This instantly blocks all session access and paper streaming.
3. Terminate all active sessions in the database for the user.
4. If needed, click **Block Selling** (`canSell: false`) to prevent fraudulent paper submissions.
5. Review the **Audit Log** filtered by the user's ID to trace all IP addresses, downloaded papers, and submitted transactions.

### Runbook D: "Paper must be removed urgently (Copyright / Exam Leak)"
1. Go to **Admin Dashboard > Papers Manager**.
2. Locate the paper using search or course filter (e.g. `Phys 1011`).
3. Toggle status to **HIDDEN** or click **Delete** (Soft-delete).
   - Once deleted or hidden, the server immediately denies all stream tickets and page requests with HTTP 403 / 404.
4. To permanently remove the asset from private storage: Delete the corresponding storage key (`published/...`) from the private storage bucket.
5. An immutable entry is automatically recorded in the cryptographic **Audit Log** detailing the deletion action, timestamp, and admin actor.
