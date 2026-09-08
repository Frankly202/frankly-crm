# FranklyEdu Global CRM MVP — Project Roadmap

This document is the **single source of truth** for the project lifecycle. Phases are executed strictly sequentially. A phase is marked `[COMPLETE]` only when all its deliverables, validation gates, and completion criteria have verified and passed.

---

## Roadmap Rules

1. **Sequential Execution**: Do not start or blend future-phase work before the current phase is verified and approved.
2. **Quality Gates at Every Phase**:
   - `npm run lint`
   - `npm run build` (`tsc --noEmit`)
   - Unit tests
   - Integration tests
3. **No Assumptions on Blockers**: If an external dependency or requirement is blocked, document it under the phase and halt until resolved.
4. **Status Flags**:
   - `[PLANNED]`
   - `[IN PROGRESS]`
   - `[BLOCKED]`
   - `[COMPLETE]`

---

## Phase Overview

| Phase | Title | Target Area | Status |
| :---: | :--- | :--- | :---: |
| **1** | Project & Backend Foundation | Environment, Tooling, Docker, Express setup | `[COMPLETE]` |
| **2** | Database & Domain Layer | PostgreSQL, Prisma Schema, Migrations, Seed | `[COMPLETE]` |
| **3** | Authentication & Security Baseline | JWT tokens, Refresh token rotation, bcrypt, RBAC | `[COMPLETE]` |
| **4** | Core CRM Domain APIs & Metrics | Contacts, Leads (5 categories), Activities, Dashboard Metrics | `[COMPLETE]` |
| **5** | Unified Inbox & Channel Adapters | Conversation/Message engine, Webhook routers, Local fixtures | `[COMPLETE]` |
| **6** | API Contract & Frontend Handoff | OpenAPI/Swagger spec, Postman collection, Lovable contract | `[COMPLETE]` |
| **7** | Frontend Implementation | Next.js, Tailwind CSS, TanStack Query, Lovable design | `[COMPLETE]` |
| **8** | Frontend & Backend Integration | End-to-end local wiring, State synchronization, Real-time updates | `[COMPLETE]` |
| **9** | External Provider Integrations | Meta Cloud API (WhatsApp/IG) & Resend setup (non-disruptive) | `[COMPLETE]` |
| **10** | Final Security Audit & E2E Verification | Final audit, vulnerability scan, E2E suite, launch sign-off | `[COMPLETE]` |

---

## Phase 1: Project & Backend Foundation

- **Objective**: Establish the TypeScript backend repository, Dockerized PostgreSQL environment, configuration management, and quality toolchain.
- **Scope & Deliverables**:
  - `backend/package.json` with minimal, modern dependencies (Express, TypeScript, Zod, tsx, vitest/jest, eslint, prettier).
  - `docker-compose.yml` defining PostgreSQL 16 with health checks and persistent volume.
  - `backend/src/config/env.ts` using Zod for fail-fast runtime environment validation.
  - Express server skeleton (`app.ts`, `server.ts`) with standard JSON parsing, helmet, CORS, global error handler, and request logging.
  - Healthcheck endpoint: `GET /api/v1/health`.
  - Testing harness (unit and integration test runners configured).
- **Validation Gates**:
  - `npm run lint` passes with zero errors.
  - `npm run build` succeeds without type errors.
  - Unit/healthcheck test passes.
  - Docker container boots and accepts PostgreSQL connections.
- **Completion Criteria**: Clean backend build boots locally and responds successfully to `GET /api/v1/health`.
- **Dependencies / Blockers**: None.

---

## Phase 2: Database & Domain Layer

- **Objective**: Model the CRM domain in Prisma, generate migrations, and seed initial admin credentials.
- **Scope & Deliverables**:
  - `prisma/schema.prisma` with:
    - `User` & `RefreshToken` (ADMIN, AGENT roles).
    - `Contact` (multi-channel identities: phone, email, Instagram handle).
    - `Lead` (5 business categories, statuses, next actions + due dates, source channel).
    - `Conversation` & `Message` (unified inbox model with deduplication on externalMessageId).
    - `ActivityLog` (event logging for audits and dashboard metrics).
  - Prisma migrations generated and applied to local PostgreSQL.
  - Database client singleton with graceful shutdown hooks.
  - Seed script creating Frankly as initial `ADMIN` (`emmanuel@frankedu-global.com`) and baseline seed data for local testing.
- **Validation Gates**:
  - `npm run lint` & `npm run build` pass.
  - Prisma schema validates and migration executes cleanly against Docker PostgreSQL.
  - Database seed runs idempotently and populates expected initial data.
- **Completion Criteria**: PostgreSQL database schema verified, migration history recorded, and seed test verifies seeded admin user.
- **Dependencies / Blockers**: Phase 1 completed.

---

## Phase 3: Authentication & Security Baseline

- **Objective**: Implement secure, role-guarded authentication with access and refresh tokens.
- **Scope & Deliverables**:
  - Password hashing with `bcrypt` (12 salt rounds) and password complexity rules via Zod.
  - Cryptographically secure refresh token generation, DB storage (SHA-256 hashed), atomic rotation on use (race-condition safe via database transaction), and reuse detection revocation.
  - JWT utilities for signing and verifying 15-minute access tokens.
  - Auth endpoints:
    - `POST /api/v1/auth/login`
    - `POST /api/v1/auth/refresh`
    - `POST /api/v1/auth/logout`
    - `GET /api/v1/auth/me`
    - `POST /api/v1/auth/register` (ADMIN-only user creation; public registration disabled to eliminate privilege escalation)
  - Auth middlewares: `authenticate` (JWT bearer) and `requireRole(Role.ADMIN)`.
  - Brute-force rate limiter on auth routes.
- **Validation Gates**:
  - `npm run lint` & `npm run build` pass.
  - Unit tests: password hashing, token generation, Zod schemas.
  - Integration tests: login success/failure, token refresh rotation, concurrent race safety verification, unauthorized access rejection, role guard enforcement.
- **Completion Criteria**: All auth integration tests pass; sensitive fields never leak in responses.
- **Dependencies / Blockers**: Phase 2 completed.

---

## Phase 4: Core CRM Domain APIs & Metrics

- **Objective**: Build CRUD and workflow endpoints for Contacts, Leads (5 categories), Activities, and Dashboard Metrics.
- **Scope & Deliverables**:
  - **Contacts API**: List (with search/filters), Create, Get by ID (360-view with linked leads and history), Update.
  - **Leads API**:
    - List leads with filters (`category`, `status`, `assignedTo`, `search`, pagination).
    - Create manual lead.
    - Update lead status with automated `ActivityLog` recording.
    - Set/update `nextActionRequired` and `nextActionDueDate`.
  - **Dashboard Metrics**: `GET /api/v1/leads/dashboard/metrics` computing:
    - Counts by status (`NEW`, `CONTACTED`, `REPLIED`, `QUALIFIED`, `CLOSED`).
    - Counts by the 5 business categories.
    - Pending next actions (overdue, due today, upcoming).
    - Daily & weekly lead activity summary.
- **Validation Gates**:
  - `npm run lint` & `npm run build` pass.
  - Unit tests: Business logic filters and metric aggregations.
  - Integration tests: Full lifecycle of a lead (creation, status update, next action assignment, metric updates).
- **Completion Criteria**: All Contact, Lead, and Metrics endpoints functional and covered by integration tests.
- **Dependencies / Blockers**: Phase 3 completed.

---

## Phase 5: Unified Inbox & Channel Adapters

- **Objective**: Implement the provider-agnostic messaging engine, webhook receiver, and realistic local fixtures for all 4 MVP channels.
- **Scope & Deliverables**:
  - Normalized `ChannelAdapter` interface and dispatcher (`NormalizedInboundMessage`).
  - Realistic local webhook fixtures for:
    - **Website Enquiry Form**: Public CORS-enabled endpoint (`POST /api/v1/webhooks/website`) with honeypot & rate limiting.
    - **WhatsApp Business**: Meta Cloud API webhook format fixture and normalizer.
    - **Instagram**: Meta Graph API messaging fixture and normalizer.
    - **Resend**: Email inbound webhook fixture and normalizer.
  - Ingestion pipeline:
    - Contact resolution/linking by phone, email, or social handle.
    - Conversation threading and message deduplication (`externalMessageId`).
    - Lead auto-creation or automatic transition to `REPLIED` when a lead responds.
  - **Conversations API**:
    - `GET /api/v1/conversations`: Unified inbox list sorted by last activity, filterable by channel/status.
    - `GET /api/v1/conversations/:id`: Chronological message timeline.
    - `POST /api/v1/conversations/:id/messages`: Outbound reply dispatcher.
    - `PATCH /api/v1/conversations/:id/read`: Read receipt marker.
- **Validation Gates**:
  - `npm run lint` & `npm run build` pass.
  - Unit tests: Normalizer adapters correctly transform raw fixtures into `NormalizedInboundMessage`.
  - Integration tests: Simulating inbounds for all 4 channels creates contacts, threads conversations, updates lead statuses, and prevents duplicate messages.
- **Completion Criteria**: Complete channel pipeline operates locally with fixtures without external network dependencies.
- **Dependencies / Blockers**: Phase 4 completed.

---

## Phase 6: API Contract & Frontend Handoff

- **Objective**: Produce comprehensive, unambiguous API documentation and mock contracts for the Lovable/Next.js frontend development.
- **Scope & Deliverables**:
  - OpenAPI 3.0 / Swagger specification file (`docs/api-spec.yaml` or `docs/api-spec.json`).
  - Comprehensive API documentation (`docs/API_CONTRACT.md`) detailing all request/response envelopes, authentication headers, error codes, and query params.
  - Postman / Thunder Client collection for rapid manual testing.
- **Validation Gates**:
  - Spec validation passes against OpenAPI 3.0 linting tools.
  - Every implemented endpoint matches the documented contract.
- **Completion Criteria**: API contract finalized and ready for frontend team to build against in Lovable without backend ambiguities.
- **Dependencies / Blockers**: Phase 5 completed.

---

## Phase 7: Frontend Implementation

- **Objective**: Build the Next.js frontend application based on the established API contract and Lovable designs.
- **Scope & Deliverables**:
  - Next.js application setup in `frontend/` (TypeScript, Tailwind CSS, TanStack Query).
  - Clean UI components for:
    - Authentication (Login screen, session persistence).
    - Unified Inbox (Channel filter tabs, conversation list, message timeline, quick-reply composer).
    - Leads View (Categorized by the 5 sectors, status tags, next action alerts).
    - Contacts Directory.
    - Dashboard Overview (Metrics counters: New, Contacted, Replied, Pending actions).
- **Validation Gates**:
  - Frontend lint and typecheck pass (`npm run lint`, `npm run build`).
  - Component unit tests pass.
- **Completion Criteria**: Frontend builds cleanly with complete UI workflows interacting with API contracts.
- **Dependencies / Blockers**: Phase 6 completed.

---

## Phase 8: Frontend & Backend Integration

- **Objective**: Wire the frontend to the local backend, validating end-to-end data flows in local development.
- **Scope & Deliverables**:
  - Configure environment variables and API proxy in frontend.
  - Real data fetching, optimistic updates, and cache invalidation via TanStack Query.
  - Complete integration of all user journeys (login, reviewing new leads, responding in unified inbox, updating next actions).
- **Validation Gates**:
  - Frontend and backend communicate cleanly without CORS or authentication errors.
  - Full local end-to-end flows pass manual and automated smoke checks.
- **Completion Criteria**: Working, cohesive CRM application running locally with frontend connected to backend.
- **Dependencies / Blockers**: Phase 7 completed.

---

## Phase 9: External Provider Integrations `[COMPLETE]`

- **Objective**: Establish production-ready external provider integration capabilities for WhatsApp, Instagram, and Resend with strict fail-closed live execution, non-disruptive email delivery, and zero-leak diagnostics.
- **Scope & Deliverables**:
  - **Fail-Closed Dual Mode Architecture**:
    - `PROVIDER_MODE=mock` (default): Simulates provider dispatch for offline development, local smoke testing, and CI/CD pipelines without external cloud accounts.
    - `PROVIDER_MODE=live`: Strictly fail-closed. If required credentials, tokens, or sender addresses are missing or invalid, immediately throws structured `502 BAD_GATEWAY` (`BadGatewayError`). Never falls back to mock and never persists simulated IDs.
  - **Meta Cloud API (WhatsApp Business & Instagram Direct)**:
    - Centralized and configurable `META_GRAPH_API_VERSION` defaulting to **`v26.0`** (official stable release).
    - WhatsApp: HTTPS `POST /messages` dispatch with sanitized E.164 phone formatting and real `wamid.*` extraction.
    - Instagram: HTTPS `POST /me/messages` dispatch with sanitized Instagram Scoped User IDs (IGSID).
    - Channel-aware recipient resolution in `ConversationService`.
  - **Resend Inbound/Outbound Email Setup**:
    - Live outbound HTTPS `POST /emails` dispatch with configurable `EMAIL_FROM_ADDRESS` and `EMAIL_REPLY_TO` (preserving `emmanuel@frankedu-global.com`).
    - Svix 5-minute timestamp replay protection on inbound webhooks (`Math.abs(now - timestamp) <= 300s`).
    - Separated safe development path (inbound simulation / fixtures) from production custom-domain/DNS setup.
  - **Provider Health Diagnostics**:
    - Lightweight non-sensitive health reporting (`NOT_CONFIGURED`, `CONFIGURED`, `MISCONFIGURED`) via `GET /api/v1/health`.
- **Validation Gates**:
  - 168 / 168 backend unit & integration tests passing across 26 suites.
  - Fail-closed live mode verified for all providers (rejecting unconfigured live requests, handling upstream 4xx/5xx errors).
  - Webhook timing-safe comparisons and Svix replay rejection verified.
  - All frontend gates (`tsc`, `lint`, `test`, `build`) passing cleanly.
- **Completion Criteria**: Complete, audited provider integration layer operational; zero impact on existing business mailbox.
- **Production Operational Dependencies**: Future production rollout requires Frankly to provision live Meta WABA assets, Instagram Page access tokens, and an approved dedicated subdomain for Resend DNS records.

---

## Phase 10: Final Security Audit & E2E Verification `[COMPLETE]`

- **Objective**: Final security audit, comprehensive test suite verification, and MVP launch readiness.
- **Scope & Deliverables**:
  - **Production Security Hardening & Guardrails**:
    - Added strict Zod refinement in `backend/src/config/env.ts` rejecting development fallback secrets (`JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`) when `NODE_ENV=production`.
    - Added `refreshRateLimiter` (60 req / 15 min per IP) on `POST /api/v1/auth/refresh` to mitigate token flood / brute-force attempts.
    - Corrected CORS origin validation in `backend/src/app.ts` using `callback(null, false)` to reject unauthorized origins without generating 500 internal server error logs.
    - Fixed cross-column unread conversation filtering in `ConversationService` (`lastReadAt IS NULL OR lastMessageAt > lastReadAt`) to ensure newly arrived messages on read threads appear accurately in the inbox.
  - **Automated Continuous E2E Customer Journey Lifecycle Suite**:
    - Implemented `backend/tests/integration/e2e-crm-lifecycle.test.ts` covering the complete critical path:
      - Inbound website enquiry webhook -> Auto-creates Contact & Lead in `NEW` status -> Lead reflected in Dashboard metrics -> Agent reads thread in inbox -> Status changed to `CONTACTED` -> Customer reply via WhatsApp auto-transitions lead to `REPLIED` -> Agent outbound reply -> Lead assigned to agent -> Next action scheduled -> Complete ActivityLog trail verified across all 8 milestones.
  - **Operational Handoff Documentation**:
    - Created `docs/OPERATIONAL_GUIDE.md` covering deployment, environment configuration, database migrations/seeding, and non-disruptive external provider setup runbooks.
  - **Automated Dependency Vulnerability Scan**:
    - Confirmed 0 vulnerabilities across backend and frontend via `npm audit`.
  - **Security Audit & Secrets Sanitization**:
    - Zero secret leakage in git history or tracked files; `.env` remains gitignored.
- **Validation Gates**:
  - All unit, integration, and E2E tests pass 100% (186/186 backend tests across 28 suites; 21/21 frontend tests across 4 suites).
  - 0 TypeScript compiler errors and 0 ESLint errors across backend and frontend.
  - Production frontend SSR bundle built cleanly via Nitro.
  - Zero critical/high vulnerability warnings (`npm audit`).
  - **Browser Verification Record**:
    - **Manual browser smoke test PASSED**: Authenticated with local admin credentials, restored session, verified real PostgreSQL data on Dashboard and Leads table, selected active conversation thread in Unified Inbox, sent outbound reply, and observed immediate thread persistence with toast notification without runtime console errors or mock fallback UI.
    - **Automated browser tool limitation**: Browser automation via `browser_subagent` remained unavailable due to the documented environment CDP protocol context limitation (`Browser.setDownloadBehavior: Browser context management is not supported`). Automated browser automation is strictly not claimed to have passed.
- **Completion Criteria**: Production-ready, fully verified MVP with confirmed security audit, passing E2E test suite, and passing manual browser smoke test.
- **Dependencies / Blockers**: None (All 10 project phases complete).
