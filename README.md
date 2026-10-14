# SafeSplit — Developer Guide

> Get your environment running, understand the stack, and contribute safely.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [First-Time Setup (Local)](#3-first-time-setup-local)
4. [First-Time Setup (Remote — VS Code)](#4-first-time-setup-remote--vs-code)
5. [EC2 Deployment](#5-ec2-deployment)
6. [Daily Workflow](#6-daily-workflow)
7. [Project Structure](#7-project-structure)
8. [Architecture](#8-architecture)
9. [API Reference](#9-api-reference)
10. [Database Rules](#10-database-rules)
11. [Testing](#11-testing)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Git & Branching](#13-git--branching)
14. [Environment Variables](#14-environment-variables)
15. [Secure Login & HTTPS Implementation](#15-secure-login--https-implementation)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Project Overview

**SafeSplit** is a secure web-based group expense and bill-splitting platform built for ICT2216 — Secure Software Development.

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite (production build) + React Router |
| Backend | Node.js + Express 5 |
| Database | PostgreSQL 16 |
| Auth | JWT (HttpOnly cookie) + bcryptjs, server-side sessions |
| Validation | Zod |
| Email | Nodemailer + SMTP (falls back to console log in dev) |
| Proxy | Nginx |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions (unit tests → Selenium E2E → auto-deploy to EC2) |

**Key features:** group creation with invite/accept flow, expense splitting (equal or custom), multi-currency support, settlement recording with payee confirmation, full transaction history, append-only audit logging, and an admin panel for user management.

---

## 2. Prerequisites

| Tool | Install |
|------|---------|
| Docker Desktop | https://www.docker.com/products/docker-desktop |
| Git | https://git-scm.com/downloads |
| Node.js 20 LTS | https://nodejs.org — only needed outside Docker |

```bash
docker --version
docker compose version  # must be v2.x
git --version
```

---

## 3. First-Time Setup (Local)

### 1 — Clone the repo

GitHub requires a Personal Access Token (PAT) — password auth is not supported.

Get one at: **GitHub → Settings → Developer settings → Personal access tokens (classic)** → scope: `repo`

```bash
git clone https://github.com/ValElizaTan/ict2216-safesplit.git
cd ict2216-safesplit
```

When prompted for credentials:
- **Username:** your GitHub username
- **Password:** your PAT (not your GitHub password)

### 2 — Create your `.env`

```bash
cp .env.example .env
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# or, without Node:
python3 -c "import secrets; print(secrets.token_hex(64))"
```

Fill in `.env` — for **local development**:

```env
DB_NAME=safesplit
DB_USER=safesplit_user
DB_PASSWORD=your_strong_password_here
JWT_SECRET=paste_generated_secret_here
FRONTEND_URL=http://localhost
```

> ⚠️ `.env` is gitignored — never commit it. The `.env.example` defaults to the EC2 IP, so make sure to change `FRONTEND_URL` for local dev.

### 3 — Start the stack

```bash
docker compose up --build
```

First build takes 2–5 minutes. Then open **http://localhost** — you should see SafeSplit.

Health check: `http://localhost/api/health` → `{ "status": "ok" }`

### 4 — Email verification

Registration now creates a `pending_registrations` row rather than a `users` row — the actual account is only created when the verification link is clicked. No real email is sent in local dev unless `SMTP_HOST` is configured. Find the verification link in the backend logs:

```bash
docker compose logs -f backend
# look for: [dev email] Verification link for <email>: http://localhost/verify-email?token=...
```

Open that URL in your browser, click "Verify email address", then log in normally.

To configure real email sending, add SMTP credentials to your `.env` (see [Environment Variables](#14-environment-variables)).

---

## 4. First-Time Setup (Remote — VS Code)

Use this when editing code directly on the EC2 via VS Code Remote SSH.

### Connect and open the folder

1. Connect via **Remote-SSH** as normal
2. Once the bottom-left corner shows `SSH: 3.15.217.120`, open the terminal: `` Ctrl + ` ``
3. **File → Open Folder** → type `/home/student14/ict2216-safesplit` and click OK

### If VS Code drops back to local

`Ctrl+Shift+P` → `Remote-SSH: Connect to Host` → pick host → once connected →
`Ctrl+Shift+P` again → `Remote-SSH: Open Folder on SSH Host` → type `~/ict2216-safesplit`

---

## 5. EC2 Deployment

| | |
|-|-|
| **URL** | https://3.15.217.120 *(self-signed certificate)* |
| **SSH user** | `student14` |
| **Key** | `ICT2216-AY2526-T3-student14.pem` |

```bash
chmod 600 ICT2216-AY2526-T3-student14.pem
ssh -i ICT2216-AY2526-T3-student14.pem student14@3.15.217.120
```

### First-time setup on EC2 (once per machine)

```bash
git clone https://github.com/ValElizaTan/ict2216-safesplit.git
cd ict2216-safesplit

cp .env.example .env
nano .env   # fill in values — see EC2 .env section below
chmod +x scripts/generate-selfsigned-cert.sh
./scripts/generate-selfsigned-cert.sh
docker compose up -d --build
docker compose ps   # all four containers should show "Up"
```

### EC2 `.env`

```env
DB_NAME=safesplit
DB_USER=safesplit_user
DB_PASSWORD=safesplit_pass
JWT_SECRET=<long random secret, at least 32 characters>
TLS_HOST=3.15.217.120
FRONTEND_URL=https://3.15.217.120
NODE_ENV=production
COOKIE_SECURE=true

# Optional — remove these lines to fall back to console log
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourteam@gmail.com
SMTP_PASS=yourapppassword
EMAIL_FROM=SafeSplit <yourteam@gmail.com>
```

> ⚠️ Do **not** change `DB_PASSWORD` on an existing EC2 deployment without also wiping the volume (`docker compose down -v`). Changing it while the volume exists causes PostgreSQL authentication failures.

### Deploy updates manually

```bash
cd ~/ict2216-safesplit
git pull origin main
docker compose up -d --build
docker compose ps
```

> Do **not** use `docker compose down -v` during normal updates — it deletes the PostgreSQL volume and all data. Only use it for deliberate schema resets.

### Auto-deploy via CI/CD

Pushes to `main` that pass all CI checks are deployed automatically — see [CI/CD Pipeline](#12-cicd-pipeline). Manual deploys are only needed for `.env` changes or cert renewals.

### AWS Security Group

| Port | Rule |
|------|------|
| 80 | Open (0.0.0.0/0) — HTTP redirect to HTTPS |
| 443 | Open (0.0.0.0/0) — HTTPS |
| 22 | Your IP only |
| 3000 | **Closed** — backend internal only |
| 5432 | **Closed** — PostgreSQL internal only |

---

## 6. Daily Workflow

```bash
git pull origin main
docker compose up --build    # if Dockerfile or package.json changed
docker compose up            # otherwise
```

```bash
docker compose down          # stop (keeps DB data)
docker compose down -v       # stop + wipe DB (needed after schema changes)
```

```bash
docker compose logs -f backend    # tail backend logs
docker compose logs -f            # tail all logs
docker compose ps                 # check container status
```

---

## 7. Project Structure

```text
ict2216-safesplit/
├── backend/
│   ├── server.js                    ← Entry point, middleware, route registration
│   ├── db/schema.sql                ← Single source of truth for all tables
│   ├── src/
│   │   ├── config/db.js             ← pg pool + env validation
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js    ← requireAuth, requireAdmin
│   │   │   └── validate.js          ← Zod request validation
│   │   ├── controllers/             ← Route handlers (presentation layer)
│   │   │   ├── authController.js
│   │   │   ├── userController.js
│   │   │   ├── groupsController.js
│   │   │   ├── inviteController.js
│   │   │   ├── expensesController.js
│   │   │   ├── settlementController.js
│   │   │   ├── dashboardController.js
│   │   │   └── adminController.js
│   │   └── services/                ← Business logic layer
│   │       ├── authService.js
│   │       ├── userService.js
│   │       ├── groupsService.js
│   │       ├── inviteService.js
│   │       ├── expenseService.js
│   │       ├── settlementService.js
│   │       ├── dashboardService.js
│   │       ├── adminService.js
│   │       ├── auditService.js
│   │       ├── notificationService.js
│   │       └── currencyService.js
│   └── tests/
│       ├── authMiddleware.test.js
│       ├── validateMiddleware.test.js
│       ├── expenseService.test.js
│       └── currencyService.test.js
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  ← Router + auth gate
│   │   ├── context/AuthContext.jsx
│   │   ├── services/api.js          ← fetch wrapper with credentials:include
│   │   ├── components/
│   │   │   ├── AppShell.jsx         ← Sidebar nav + header
│   │   │   └── ui/index.jsx         ← Card, Button, Badge, Spinner, Avatar, Toast
│   │   └── pages/
│   │       ├── LoginView.jsx
│   │       ├── RegisterView.jsx
│   │       ├── VerifyEmailView.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Groups.jsx
│   │       ├── GroupDetail.jsx
│   │       ├── Expenses.jsx
│   │       ├── Settle.jsx
│   │       ├── History.jsx
│   │       ├── Profile.jsx
│   │       └── Admin.jsx
├── nginx/nginx.conf                 ← Reverse proxy + TLS + security headers
├── tests/e2e/selenium.test.mjs      ← End-to-end Selenium tests
├── scripts/generate-selfsigned-cert.sh
├── .github/workflows/
│   ├── ci.yml                       ← Unit tests → Selenium → deploy to EC2
│   └── dependency-check.yml         ← OWASP dependency scan
├── compose.yaml
└── .env.example
```

---

## 8. Architecture

```text
Browser
  ↓
[Nginx :80 / :443]  (reverse proxy + TLS termination + security headers)
  ├── /       → frontend:80   (React static files)
  └── /api/*  → backend:3000  (Express API — internal only)
        ↓
      [PostgreSQL :5432]  (internal only — never publicly exposed)
```

All containers share the `safesplit-network` bridge. Only Nginx has public ports.

---

## 9. API Reference

### Auth `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | Create pending registration + send verification email |
| POST | `/verify-email` | — | Consume token → create actual user account |
| POST | `/login` | — | Authenticate + set session cookie |
| POST | `/logout` | ✅ | Revoke session server-side |
| GET | `/me` | ✅ | Current user |

Auth routes are rate-limited to **10 req / 15 min**.

### User Profile `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me` | ✅ | Get profile |
| PATCH | `/me` | ✅ | Update username / email |
| PATCH | `/me/password` | ✅ | Change password (requires current password) |
| DELETE | `/me` | ✅ | Delete account (requires password confirmation) |

### Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard` | ✅ | Balance summary + recent activity |

### Groups `/api/groups`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | ✅ | Create group |
| GET | `/` | ✅ | List my groups |
| GET | `/:id` | ✅ | Group detail (members only) |
| DELETE | `/:id` | ✅ | Delete group (owner only) |
| PATCH | `/:id/archive` | ✅ | Archive group (owner only) |
| GET | `/:id/members` | ✅ | List members |
| POST | `/:id/members` | ✅ | Send invite to email |
| DELETE | `/:id/members/:userId` | ✅ | Remove member / leave group |

### Invites `/api/invites`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/pending` | ✅ | List pending invites for current user |
| POST | `/:id/accept` | ✅ | Accept an invite |
| POST | `/:id/decline` | ✅ | Decline an invite |

### Expenses

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/expenses` | ✅ | All expenses across my groups (`?search=`, `?groupId=`) |
| POST | `/api/groups/:id/expenses` | ✅ | Create expense (`splitMethod: equal` or `custom`) |
| PUT | `/api/expenses/:id` | ✅ | Update expense (creator only) |
| DELETE | `/api/expenses/:id` | ✅ | Soft-delete expense (creator only) |
| GET | `/api/currency/rate` | ✅ | FX rate (`?from=SGD&to=USD&amount=100`) |

### Settlements `/api/settlements`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | ✅ | Record settlement (payer) |
| POST | `/:id/confirm` | ✅ | Confirm settlement (payee only) |
| POST | `/:id/writeoff` | ✅ | Write off debt (payee only) |
| GET | `/` | ✅ | Settlement history |

### Admin `/api/admin` *(admin role only)*

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | Admin | List all users |
| PATCH | `/users/:id/suspend` | Admin | Suspend / unsuspend user |
| GET | `/audit-logs` | Admin | View audit log (`?userId=`, `?actionType=`, `?from=`, `?to=`, `?limit=`) |

---

## 10. Database Rules

Schema is in `backend/db/schema.sql` — **single source of truth**. It runs automatically on container start.

| Table | Description |
|-------|-------------|
| `users` | Verified accounts with role, suspension, lockout, soft-delete |
| `pending_registrations` | Unverified registrations — row deleted on verification |
| `email_verification_tokens` | Single-use SHA-256 tokens, 24h TTL |
| `sessions` | Server-side JWT records — enables real logout revocation |
| `groups` | Expense groups with currency and active/archived state |
| `group_members` | User ↔ group membership with `owner`/`member` role |
| `group_invites` | Pending/accepted/declined invites |
| `expenses` | Expenses with currency, split method, soft-delete |
| `expense_splits` | Per-member share of each expense |
| `exchange_rates` | Cached FX rates |
| `settlements` | `pending` → `confirmed`/`written_off` workflow |
| `audit_logs` | Append-only — DB trigger blocks UPDATE/DELETE |

**Rules:**
- ✅ All schema changes go in `schema.sql`
- ✅ Announce schema changes in the team channel before pushing
- ✅ After any column/table change: `docker compose down -v && docker compose up --build`
- ❌ Never modify tables directly in psql without updating `schema.sql`

**Connect to DB directly:**
```bash
docker compose exec db psql -U safesplit_user -d safesplit
```
```sql
\dt          -- list tables
\d users     -- describe table
\q           -- quit
```

---

## 11. Testing

### Backend unit tests

```bash
cd backend && npm test
```

Covers: `authMiddleware`, `validate` middleware, `expenseService` split logic, `currencyService` conversion.

Unit tests do not require a live database — they run against a dummy environment.

### End-to-end Selenium tests

Require the full Docker stack plus a Selenium/Chrome container:

```bash
docker compose -f compose.yaml -f docker-compose.ci.yml up -d --build
# wait for health check, then:
cd tests/e2e && npm install && node selenium.test.mjs local
```

Covers: login page fields, invalid credentials error, full register → verify email → login flow.

---

## 12. CI/CD Pipeline

Two workflows run automatically on every push to `main`:

### `.github/workflows/ci.yml` — Main pipeline

```text
Push to main
  │
  ▼
Unit tests          ← npm ci + npm test (no live DB needed)
  │ pass
  ▼
Selenium E2E tests  ← full Docker stack + Chrome container
  │ pass + push only
  ▼
Deploy to EC2       ← SSH → git pull origin main → docker compose up --build -d
```

### `.github/workflows/dependency-check.yml` — OWASP scan

Runs OWASP Dependency Check on backend packages and uploads the report as a GitHub Actions artifact.

### Dependabot

Configured in `.github/dependabot.yml` — automatically opens PRs when npm dependencies have newer versions.

### GitHub Secrets required for deploy

| Secret | Value |
|--------|-------|
| `EC2_HOST` | `3.15.217.120` |
| `EC2_USER` | `student14` |
| `EC2_SSH_KEY` | Full contents of `ICT2216-AY2526-T3-student14.pem` |

---

## 13. Git & Branching

```text
main              ← submission branch — all CI must pass before merging
└── Development   ← active integration branch — branch off HERE
      └── feature/  ← your work
```

```bash
git checkout Development
git pull origin Development
git checkout -b feature/my-feature

# work, then:
git add . && git commit -m "feat: description"
git push origin feature/my-feature
# → open PR into Development
# → merge Development into main via PR when ready for submission
```

`main` has branch protection enabled — direct pushes are blocked, changes must go through a pull request.

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | No behaviour change |
| `docs:` | README / comments |
| `chore:` | Config / deps |
| `security:` | Security changes |
| `test:` | Tests only |

---

## 14. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_NAME` | ✅ | Database name |
| `DB_USER` | ✅ | Database user |
| `DB_PASSWORD` | ✅ | Database password |
| `JWT_SECRET` | ✅ | Min 32 chars — signs all session JWTs |
| `FRONTEND_URL` | ✅ | CORS allowed origin — `http://localhost` locally, `https://3.15.217.120` on EC2 |
| `TLS_HOST` | EC2 only | Public IP for self-signed cert generation |
| `NODE_ENV` | EC2 only | Set to `production` (enables Secure cookie flag) |
| `COOKIE_SECURE` | EC2 only | Set to `true` in production |
| `SMTP_HOST` | Optional | If unset, verification links are logged to console |
| `SMTP_PORT` | Optional | Default `587` |
| `SMTP_SECURE` | Optional | `true` for port 465, `false` for 587 |
| `SMTP_USER` | Optional | SMTP account username |
| `SMTP_PASS` | Optional | SMTP app password (no spaces) |
| `EMAIL_FROM` | Optional | Display name in sent emails |

`DB_HOST` and `DB_PORT` are set in `compose.yaml` and do not go in `.env`.

---

## 15. Secure Login & HTTPS Implementation

### Password storage

Passwords are hashed with **bcrypt** at cost factor **12**. Plaintext passwords are never stored, logged, or returned in any API response. To verify:

```bash
docker compose exec db psql -U safesplit_user -d safesplit \
  -c "SELECT email, LEFT(password_hash, 7) AS prefix, LENGTH(password_hash) AS len FROM users;"
```

Expected prefix: `$2b$12$`

### Authentication flow

1. User registers → stored in `pending_registrations` (not `users`)
2. Verification email sent with 256-bit random token (SHA-256 hash stored, raw token emailed)
3. User clicks link → `users` row created with `email_verified_at = NOW()`, pending row deleted
4. Login: bcrypt comparison → JWT issued with unique `jti` → stored as `HttpOnly`, `Secure`, `SameSite=Strict` cookie
5. Every request: JWT verified → `jti` checked against `sessions` table → suspension checked
6. Logout: session row revoked server-side → token cannot be reused even if stolen

### Brute-force protection

Accounts lock for 15 minutes after 5 failed login attempts. Auth endpoints are rate-limited to 10 requests per 15 minutes.

### HTTPS

The EC2 deployment uses a self-signed certificate generated by `scripts/generate-selfsigned-cert.sh`. Nginx listens on 443, redirects port 80 to HTTPS, enforces TLS 1.2/1.3 with strong AEAD cipher suites, and sets HSTS.

```bash
# Verify HTTPS and TLS version
openssl s_client -connect 3.15.217.120:443 -tls1_3 </dev/null
# Verify old TLS is rejected
openssl s_client -connect 3.15.217.120:443 -tls1_1 </dev/null
```

### Cookie verification

In Chrome DevTools → **Application → Cookies → https://3.15.217.120**, confirm the session cookie has `HttpOnly`, `Secure`, and `SameSite=Strict`.

### Files that must never be committed

- `.env`
- `certs/` directory
- `*.pem` SSH keys

---

## 16. Troubleshooting

**Container name already in use**
```bash
docker compose down && docker compose up -d --build
```

**Port already allocated**
Something else is using port 80 or 443. Stop it, or temporarily change the host port in `compose.yaml`.

**GitHub auth failed on clone**
Use a PAT when prompted — password auth is not supported:
Username: your GitHub username
Password: your PAT (ghp_xxxx...)

**Login returns 401 with correct credentials**
Confirm email is verified and `JWT_SECRET` is set in `.env`.

**Emails not sending — still showing `[dev email]` in logs**
1. Check SMTP vars are in the backend's `environment:` block in `compose.yaml` (not just in `.env`)
2. Verify they made it into the container: `docker compose exec backend printenv | grep SMTP`
3. Test connection: `docker compose exec backend node -e "require('./src/services/notificationService.js')"`
4. After editing `compose.yaml` or `.env`: `docker compose down && docker compose up -d` (restart alone is not enough)

**DB connection error in backend logs**
`DB_HOST` must be `db` (Docker service name) — not `localhost`.

**DB is empty / tables missing**
```bash
docker compose down -v && docker compose up --build
```

**Teammate updated `schema.sql`**
```bash
git pull origin main
docker compose down -v && docker compose up --build
```

**EC2 app unreachable in browser**
Check AWS Security Group — ports 80 and 443 must be open inbound. Confirm Nginx is running: `docker compose ps`.

**`SMTP_PASS` not working**
Remove spaces from the app password in `.env`: `bkqiactagrjfxcbg` not `bkqi acta grjf xcbg`.

**I accidentally committed `.env`**
Don't push. Run `git reset HEAD~1`, verify `.env` is in `.gitignore`, recommit. If already pushed — rotate all secrets immediately.

---

*ICT2216 — Secure Software Development · Team 14*
