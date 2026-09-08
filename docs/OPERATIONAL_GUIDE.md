# Frankly CRM — Operational Handoff & Deployment Guide

This document provides concise operational instructions for deploying, configuring, and maintaining Frankly CRM in production.

---

## 1. Production Architecture Overview

- **Backend**: Node.js 20+ / Express with TypeScript.
- **Frontend**: TanStack Start / React 19 / Nitro server (preset: `cloudflare-module` or Node standalone).
- **Database**: PostgreSQL 16+ managed instance (e.g. AWS RDS, Supabase, Neon, or Docker).
- **ORM**: Prisma ORM with automated migrations (`prisma/migrations`).
- **Communication Adapters**: Meta Cloud API (WhatsApp Business Platform, Instagram Graph API) and Resend (Email).

---

## 2. Environment Variables & Production Guardrails

### 2.1 Backend Environment (`backend/.env`)

| Variable | Description | Production Requirement |
|---|---|---|
| `NODE_ENV` | Environment mode (`production`, `development`, `test`) | Set to `production` |
| `PORT` | HTTP port for API service | Default `4000` |
| `DATABASE_URL` | PostgreSQL connection string | Real connection string with pooling |
| `CORS_ORIGIN` | Allowed web origins (comma-separated) | Explicit production frontend domain |
| `INITIAL_ADMIN_EMAIL` | Superadmin initial account email | `emmanuel@frankedu-global.com` |
| `INITIAL_ADMIN_PASSWORD` | Superadmin initial password | **Required**: Must be strong ($\ge 8$ chars) and cannot use dev default (`ChangeMeInEnv123!`) |
| `JWT_SECRET` | Secret key for signing access tokens | **Required**: Must be strong ($\ge 32$ chars) and cannot use dev default |
| `JWT_EXPIRES_IN` | Access token lifetime | Default `15m` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Refresh token lifetime | Default `7` |
| `PROVIDER_MODE` | Dual-mode switch (`mock` or `live`) | Default `mock` for staging; set to `live` once credentials are verified |
| `META_GRAPH_API_VERSION` | Meta Cloud API version | Default `v26.0` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Phone Number ID | Required for live WhatsApp messaging |
| `WHATSAPP_ACCESS_TOKEN` | Meta System User Access Token | Required for live WhatsApp messaging |
| `META_APP_SECRET` | Meta App Secret | Required for live webhook HMAC validation |
| `META_VERIFY_TOKEN` | Webhook verification token | Set matching value in Meta Webhook config |
| `INSTAGRAM_PAGE_ID` | Connected Facebook Page ID | Required for live Instagram messaging |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram Page Access Token | Required for live Instagram messaging |
| `RESEND_API_KEY` | Resend API Key | Required for live email sending |
| `RESEND_WEBHOOK_SECRET` | Resend Webhook Signing Secret | Required for Svix signature validation |
| `EMAIL_FROM_ADDRESS` | Verified outbound sender address | E.g., `admissions@crm.frankedu-global.com` |
| `EMAIL_REPLY_TO` | Inbound reply-to address | Optional; e.g., `emmanuel@frankedu-global.com` |

> [!CAUTION]
> **Production Guardrail**: If `NODE_ENV=production` is active, the backend refuses to boot if `JWT_SECRET` or `INITIAL_ADMIN_PASSWORD` uses the development default values.

### 2.2 Frontend Environment (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API (e.g., `https://api.crm.frankedu-global.com/api/v1`) |

---

## 3. Database Deployment & Seeding

1. **Run Migrations in Production**:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
2. **Seed Initial Admin User & Default Categories** (run once during provisioning):
   ```bash
   npx prisma db seed
   ```
   *Note: This creates the initial administrator user using `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`.*

---

## 4. Building & Running in Production

### 4.1 Backend Service
```bash
cd backend
npm ci --omit=dev
npm run build
node dist/server.js
```

### 4.2 Frontend Service
```bash
cd frontend
npm ci
npm run build
# Deploy .output/ directory to Cloudflare Pages/Workers or run standalone Nitro server
```

---

## 5. External Provider Setup Checklist (When Going Live)

### 5.1 WhatsApp Cloud API (Meta)
1. Verify business on Meta Business Manager.
2. Add a clean, dedicated phone number to WhatsApp Business Platform (cannot be in use on consumer WhatsApp).
3. Create a System User in Business Manager and assign the `whatsapp_business_messaging` permission.
4. Generate a permanent System User Token.
5. In Meta App Dashboard, subscribe webhooks to `https://<api-domain>/api/v1/webhooks/whatsapp` using your `META_VERIFY_TOKEN`.

### 5.2 Instagram Direct (Meta)
1. Convert Instagram account to an **Instagram Professional / Business Account**.
2. Link the Instagram Professional account to Frankly's Facebook Page.
3. In Instagram Account Settings, enable **"Allow Access to Messages"**.
4. In Meta App Dashboard, subscribe the webhook to `https://<api-domain>/api/v1/webhooks/instagram`.

### 5.3 Resend Email Integration (Non-Disruptive Setup)
1. Create a dedicated subdomain (e.g. `crm.frankedu-global.com`).
2. Add DNS records (TXT for SPF, CNAME for DKIM) as instructed in Resend dashboard.
3. **DO NOT modify MX records for `frankedu-global.com`** — this ensures Frankly's active inbox (`emmanuel@frankedu-global.com`) is completely untouched.
4. Register the Resend webhook endpoint: `https://<api-domain>/api/v1/webhooks/resend` with event type `email.received`.
5. Set `RESEND_WEBHOOK_SECRET` from the Resend webhook dashboard to enable Svix replay-protected verification.

---

## 6. Health & Diagnostics

The health endpoint provides instant visibility into provider and database configuration:
```bash
curl -s https://<api-domain>/api/v1/health | jq
```
Example Output:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": 86400,
    "environment": "production",
    "providers": {
      "mode": "live",
      "metaGraphApiVersion": "v26.0",
      "whatsapp": "CONFIGURED",
      "instagram": "CONFIGURED",
      "resend": "CONFIGURED"
    }
  }
}
```
If a provider is missing credentials in live mode, it will report `MISCONFIGURED` or `NOT_CONFIGURED` without leaking any secret tokens.
