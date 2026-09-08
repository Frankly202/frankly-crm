# Frankly CRM

> Internal omnichannel CRM and unified inbox for **FranklyEdu Global**.

Frankly CRM solves a critical operational challenge for FranklyEdu Global: managing cross-channel customer inquiries across education consulting, property investment, and strategic partnerships. High-intent prospective students, property investors, and partner organizations initiate contact across multiple channels (WhatsApp, Instagram Direct, email, and website forms). Frankly CRM unifies these inquiries into a single, cohesive operational workspace—eliminating fragmented conversations, preventing dropped leads, and ensuring every contact has an auditable activity trail and clear next action.

---

## Supported CRM Capabilities

- **Leads Pipeline**: Track opportunities through 6 lifecycle stages (`NEW`, `CONTACTED`, `QUALIFIED`, `PROPOSAL_SENT`, `WON`, `LOST`) classified across 5 core business categories:
  - `PROPERTY_BUYER_INVESTOR`
  - `STUDY_ABROAD_STUDENT`
  - `TOURISM_HOSPITALITY_CLIENT`
  - `STRATEGIC_PARTNER_B2B`
  - `GENERAL_INQUIRY`
- **Contacts Directory**: Centralized contact directory maintaining biographical profiles, contact identifiers, company affiliations, and linked lead histories.
- **Dashboard & Pipeline Metrics**: Summary metrics covering total pipeline volume, active deals, closed-won conversions, win rates, and inquiry channel distributions.
- **Activities & Next Actions**: Timestamped activity timeline recording lead status adjustments, notes, next follow-up dates, and agent assignments.
- **Unified Inbox**: Multi-channel conversational threads supporting bidirectional messaging, unread counts, and agent replies across all supported channels.

---

## Technical Architecture & Stack

- **Frontend**: [TanStack Start](https://tanstack.com/start) / React 19, TypeScript, Tailwind CSS, TanStack Query, Radix UI, Lucide Icons.
- **Backend API**: Node.js, Express, TypeScript, Zod schema validation, Helmet security headers, CORS, and rate limiting.
- **Database & ORM**: PostgreSQL 16 managed with [Prisma ORM](https://www.prisma.io/).
- **Authentication & Authorization**: Stateless JWT access tokens (15-minute expiration) paired with rotating refresh tokens (7-day sliding expiration, family invalidation on reuse detection), bcrypt password hashing, and role-based access control (`ADMIN`, `AGENT`).
- **Local Infrastructure**: Docker Compose containerized PostgreSQL database.

---

## Ingestion Channels & Integration Status

The backend provides normalized webhook adapters and schema validators for 4 ingestion channels:
- **WhatsApp**: Meta Cloud API webhook payload normalization.
- **Instagram Direct**: Meta Graph messaging event normalization.
- **Resend**: Inbound email notification event normalization.
- **Website Form**: Custom JSON submission endpoint.

> **Note on External Providers**: Live third-party provider accounts (Meta Business Manager, WhatsApp Cloud API, Instagram Graph API, and Resend production API keys) are **planned for Phase 9** and are **not yet connected**. The current system operates against local webhook routers, normalized adapters, and simulation fixtures.

---

## Monorepo Layout

```text
frankly-crm/
├── backend/                  # Express REST API, Prisma schema, tests, and webhook adapters
│   ├── prisma/               # Database schema, migrations, and seed scripts
│   ├── src/                  # Application modules (auth, leads, contacts, webhooks, metrics)
│   └── tests/                # Unit and integration test suites
├── frontend/                 # TanStack Start / React web application
│   ├── public/               # Branding assets and favicons
│   ├── src/                  # CRM components, routes, auth context, API client
│   └── src/test/             # Component and regression test suites
├── docs/                     # Project architecture, API specs, and roadmap
│   ├── API_CONTRACT.md       # Full API contract, schemas, and error conventions
│   ├── ROADMAP.md            # Phase-by-phase development status
│   ├── api-spec.yaml         # OpenAPI 3.1 specification
│   └── frankly-crm-postman-collection.json
├── docker-compose.yml        # Local PostgreSQL service definition
├── .gitignore                # Monorepo gitignore rules
└── README.md                 # Project overview and local development instructions
```

---

## Local Development Setup

### Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Docker & Docker Compose**

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/Abraham3stack/frankly-crm.git
cd frankly-crm

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

### 2. Environment Configuration

Copy the example environment files:

```bash
# Backend environment configuration
cp backend/.env.example backend/.env

# Frontend environment configuration
cp frontend/.env.example frontend/.env
```

Default local service ports:
- **Backend API**: `http://localhost:4000/api/v1`
- **Frontend App**: `http://localhost:8080`
- **PostgreSQL**: `localhost:5435` (`frankly_crm` / `frankly_user` / `frankly_pass`)

### 3. Start Local PostgreSQL

```bash
docker compose up -d
```

### 4. Run Database Migrations and Seed

```bash
cd backend
npm run db:migrate
npm run db:seed
cd ..
```

*The seed script initializes the default admin user, test agents, contacts, leads, conversations, and webhook fixtures.*

### 5. Start Development Servers

In separate terminal tabs or background sessions:

```bash
# Terminal 1: Backend API (port 4000)
cd backend
npm run dev

# Terminal 2: Frontend App (port 8080)
cd frontend
npm run dev
```

Visit `http://localhost:8080` to access the CRM application.

---

## Verification & Quality Gates

Run the test and lint suites across both packages:

```bash
# Backend validation
cd backend
npm run typecheck
npm run lint
npm run test

# Frontend validation
cd ../frontend
npx tsc --noEmit
npm run lint
npm test
npm run build
```

---

## Project Documentation & Links

- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — Comprehensive REST API endpoints, parameter contracts, pagination, and error envelopes.
- [docs/ROADMAP.md](docs/ROADMAP.md) — Phase-by-phase implementation roadmap and current completion status.
