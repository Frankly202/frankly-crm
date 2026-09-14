# Frankly CRM — Meta Channel Integration Roadmap
## WhatsApp Business Cloud API, Instagram Professional & Facebook Messenger

> **Document Type:** Architectural, Security & Implementation Roadmap  
> **Target Subsystems:** Meta Developer Infrastructure, Webhook Pipeline, Channel Adapters, Conversation Service, Unified Inbox UI  
> **Target Channels:** `WHATSAPP` (Cloud API), `INSTAGRAM` (Professional Direct), `MESSENGER` (Facebook Page)  
> **Parent Roadmaps:** [docs/ROADMAP.md](file:///Users/abrahamogbu/Developer/frankly-crm/docs/ROADMAP.md) & [docs/EMAIL_REMEDIATION_ROADMAP.md](file:///Users/abrahamogbu/Developer/frankly-crm/docs/EMAIL_REMEDIATION_ROADMAP.md)  
> **Status:** `[PLANNED]` — Ready for sequential phase execution  
> **Execution Mode:** Read-Only Audit & Roadmap Refinement. Zero application code or database migrations executed.

---

## 1. Executive Summary & Audit Findings

### 1.1 Objective
Frankly CRM currently operates with an active, production-verified `RESEND_EMAIL` channel and simulated/mocked `WHATSAPP` and `INSTAGRAM` adapters. The objective of this roadmap is to elevate Frankly CRM's communication suite by connecting live **WhatsApp Business Cloud API**, **Instagram Professional Direct Messaging**, and **Facebook Page Messenger** into the existing Unified Inbox, preserving Frankly CRM's core lead-tracking and contact-unification architecture while ensuring strict security, race-safety, and Meta Platform policy compliance.

### 1.2 Summary of Codebase Audit Findings

| Component / Layer | Current State | Critical Findings & Required Remediation |
|---|---|---|
| **Meta Developer Assets** | Unconfigured / Mocked | No verified WhatsApp Business Account (WABA), linked Instagram Professional account, or configured Meta Business App exists yet for Frankly CRM. Live development requires an initial asset setup phase with App Roles (Testers) to enable sandbox testing prior to App Review. |
| **Webhook Verification** | Implemented in `WebhookController` & Adapters | Challenge verification handles `hub.mode=subscribe` and `hub.verify_token`. However, HMAC SHA-256 validation is duplicated across `whatsapp.adapter.ts` and `instagram.adapter.ts`, and verification fails if `rawBody` is not preserved in middleware. Needs unified, reusable verification utility (`meta-signature.util.ts`). |
| **Delivery & Read Statuses** | Completely dropped | `whatsapp.adapter.ts` only looks for `change.value.messages`. When Meta posts message status receipts (`sent`, `delivered`, `read`, `failed` inside `change.value.statuses`), the adapter returns `[]` and drops the event. The CRM message status remains `SENT` forever. |
| **Instagram Recipient Routing** | **Critical Bug in Outbound Sending** | Inbound adapter normalizes `senderIdentifier` to `@username` or numerical ID. Outbound adapter (`sendOutboundMessage`) strips `@` and sends `recipient.id = username`. **Meta Graph API strictly requires the numerical Instagram-Scoped ID (IGSID).** Passing a username string throws Meta Graph API Error `(#100) Invalid parameter: recipient.id`. |
| **Facebook Messenger** | **Not implemented** | Absent from `ChannelType` enum in `prisma/schema.prisma` and frontend types. No adapter or webhook endpoint exists for Facebook Page messaging (`object: "page"`). |
| **Messaging Windows & Policies** | Not tracked or enforced | Meta enforces strict messaging windows for WhatsApp and Instagram. Free-form WhatsApp messages outside 24h fail with error `131047` (template required). Instagram/Messenger permit 7-day agent replies using the `HUMAN_AGENT` tag. The CRM currently attempts free-form sends regardless of time elapsed. |
| **Media & Attachments** | Degraded to text strings | Inbound images/audio/documents are converted to `[Unsupported message type: ...]`. While Frankly CRM intentionally avoids storing raw binaries in PostgreSQL, media metadata (Media ID, MIME type, caption) must be preserved in `Message.rawPayload` to enable future retrieval without dropping customer context. |
| **Environment Variables** | Incomplete in `.env.example` | Missing `WHATSAPP_BUSINESS_ACCOUNT_ID` (WABA ID), `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, and `INSTAGRAM_BUSINESS_ACCOUNT_ID`. |
| **Frontend Status Indicators** | Already built in `inbox.tsx` | The Inbox UI already renders delivery status indicators: `PENDING` (Clock), `SENT` (Single check), `DELIVERED` (Double check), and `FAILED` (Red label). Wiring inbound Meta status webhooks will activate these indicators in the UI with zero layout restructuring. |

---

## 2. Platform Architecture & Verified Standards

### 2.1 Complete Architectural Data Flow

```
                                  META PLATFORM INFRASTRUCTURE
       ┌───────────────────────────────────────┬───────────────────────────────────────┐
       │   WhatsApp Business Cloud API         │  Instagram Professional / Messenger   │
       │   (WABA & Phone Number ID)            │  (Facebook Page & Connected IG)       │
       └───────────────────┬───────────────────┴───────────────────┬───────────────────┘
                           │                                       │
                           │ HTTPS POST Webhooks                   │ HTTPS POST Webhooks
                           │ (x-hub-signature-256)                 │ (x-hub-signature-256)
                           ▼                                       ▼
                     ┌───────────────────────────────────────────────────┐
                     │           Frankly CRM Inbound Router              │
                     │  POST /api/v1/webhooks/whatsapp                   │
                     │  POST /api/v1/webhooks/instagram                  │
                     │  POST /api/v1/webhooks/messenger                  │
                     └─────────────────────────┬─────────────────────────┘
                                               │
                                 HMAC SHA-256 Signature Audit
                                 (Reject untrusted requests: 401)
                                               │
                                               ▼
                     ┌───────────────────────────────────────────────────┐
                     │            Payload Normalization Engine           │
                     ├───────────────────────────────────────────────────┤
                     │ Inbound Message Event   │ Inbound Status Callback │
                     │ • Extract sender ID     │ • Match externalMsgId   │
                     │ • Extract timestamp     │ • Transition status:    │
                     │ • Extract body & media  │   SENT -> DELIVERED     │
                     │   metadata              │   DELIVERED -> READ     │
                     └─────────────┬───────────┴─────────────┬───────────┘
                                   │                         │
                                   ▼                         ▼
                     ┌──────────────────────────┐  ┌─────────────────────┐
                     │ WebhookService Ingestion │  │ Status Update Engine│
                     │ • Resolve/Create Contact │  │ (Updates Message    │
                     │ • Resolve Open Lead      │  │  in PostgreSQL)     │
                     │ • Upsert Conversation    │  └──────────┬──────────┘
                     │ • Persist Message        │             │
                     │ • Write ActivityLog      │             │
                     └─────────────┬────────────┘             │
                                   │                          │
                                   ▼                          ▼
                     ┌───────────────────────────────────────────────────┐
                     │         Unified Inbox (frontend/src/inbox)        │
                     │  • Polls active state every 15s                   │
                     │  • Visual checkmarks for SENT/DELIVERED/READ      │
                     │  • Real-time channel badges & reply composer      │
                     └─────────────────────────┬─────────────────────────┘
                                               │
                                   Agent Outbound Reply
                                               ▼
                     ┌───────────────────────────────────────────────────┐
                     │               Conversation Service                │
                     │  • Validate messaging window status               │
                     │  • Resolve channelThreadId (Phone / IGSID / PSID) │
                     │  • Attach HUMAN_AGENT tag if eligible             │
                     └─────────────────────────┬─────────────────────────┘
                                               │
                                               ▼
                     ┌───────────────────────────────────────────────────┐
                     │               Meta Graph API Dispatch             │
                     │  WhatsApp:  POST /v26.0/{phone_number_id}/messages│
                     │  Instagram: POST /v26.0/me/messages               │
                     │  Messenger: POST /v26.0/me/messages               │
                     └───────────────────────────────────────────────────┘
```

### 2.2 Identifier & Threading Comparison Matrix

| Channel | Inbound Customer ID in Webhook | CRM Contact Model Field | CRM Conversation `channelThreadId` | Outbound Dispatch Recipient ID (`recipient.id`) | Expiration Window Policy |
|---|---|---|---|---|---|
| **WhatsApp** | `from`: E.164 phone string (e.g. `35799445566`) | `Contact.primaryPhone` (`+35799445566`) | `+35799445566` | E.164 digits without `+` (`35799445566`) | **24 Hours** from customer inbound. Free-form text allowed. After 24h: Pre-approved template required. *(Verify exact tier rules during Phase 2)* |
| **Instagram** | `sender.id`: Numerical IGSID (e.g. `17841400000000001`) | `Contact.instagramHandle` (Display handle) + `Contact.metadata.instagramId` | Canonical IGSID (`17841400000000001`) | Canonical IGSID (`17841400000000001`) | **24 Hours** standard. **7 Days** with `HUMAN_AGENT` message tag. *(Verify exact tag review rules during Phase 3)* |
| **Messenger** | `sender.id`: Numerical PSID (Page-Scoped ID, e.g. `456789123456`) | `Contact.metadata.messengerId` | Canonical PSID (`456789123456`) | Canonical PSID (`456789123456`) | **24 Hours** standard. **7 Days** with `HUMAN_AGENT` message tag. *(Verify exact tag review rules during Phase 4)* |

> [!CAUTION]
> **CRITICAL ARCHITECTURAL PITFALL: INSTAGRAM IGSID**  
> Under Meta Graph API rules, an Instagram handle (e.g. `@john_doe`) is **never** valid in `recipient.id` for outbound messaging. If `Conversation.channelThreadId` stores a username handle, outbound messages will fail with HTTP 400 (`Invalid parameter: recipient.id`). `Conversation.channelThreadId` must store the numerical **IGSID**, while `Contact.instagramHandle` or `Contact.name` stores the human-readable username.

---

## 3. Platform Verification & Policy Checkpoints

> [!IMPORTANT]
> **POLICY VERIFICATION REQUIREMENT DURING IMPLEMENTATION**  
> Meta Platform policies, Graph API version lifecycles, and messaging tags change periodically. Implementations must not treat historical window rules as permanent assumptions. Each phase includes an explicit pre-implementation task to verify current documentation against the active Graph API release (`v26.0` LTS).

### 3.1 Policy Checkpoints to Re-Verify at Execution
1. **WhatsApp Business Cloud API:**
   - Confirm current 24-hour customer service window enforcement for free-form responses.
   - Confirm current WhatsApp conversation-based pricing tier rules (e.g. 1,000 free service conversations per WABA per month).
   - Confirm template submission APIs and category classification (`UTILITY`, `MARKETING`, `AUTHENTICATION`).
2. **Instagram Direct & Facebook Messenger:**
   - Confirm current requirements for the `HUMAN_AGENT` message tag. In Graph API, `HUMAN_AGENT` allows responding to user queries within a 7-day window. Confirm whether `HUMAN_AGENT` requires dedicated App Review approval or is automatically granted with `instagram_manage_messages` and `pages_messaging`.
   - Confirm rate limits for Graph API messaging calls (typically 200 calls/hour per page for Instagram, 80 calls/sec for WhatsApp Cloud API).

---

## 4. Environment Variables & Planned Consumer Directory

Every new environment variable in [backend/.env.example](file:///Users/abrahamogbu/Developer/frankly-crm/backend/.env.example) is explicitly tied to a consuming service or adapter. Unused variables have been eliminated.

| Variable Name | Consuming File / Service | Primary Purpose & Usage | Planned Phase |
|---|---|---|---|
| `META_GRAPH_API_VERSION` | `WhatsAppAdapter`, `InstagramAdapter`, `MessengerAdapter` | Specifies Meta Graph API version in HTTP requests (default `v26.0`). | Phase 0 & 1 |
| `META_APP_ID` | `WebhookController`, App Review configuration | Identifies the Meta Business App for verification and webhook headers. | Phase 0 |
| `META_APP_SECRET` | `meta-signature.util.ts` | Computes HMAC SHA-256 signature to validate incoming `x-hub-signature-256` headers. | Phase 1 |
| `META_VERIFY_TOKEN` | `WebhookController.verifyMetaChallenge` | Shared secret string used during Meta Webhook GET challenge verification (`hub.verify_token`). | Phase 0 & 1 |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | `WhatsAppAdapter`, `WebhookController` | WhatsApp Business Account (WABA) ID. Consumed for webhook tenant validation and template management. | Phase 0 & 2 |
| `WHATSAPP_PHONE_NUMBER_ID` | `WhatsAppAdapter.sendOutboundMessage` | Identifies Frankly's WhatsApp phone number endpoint: `POST /{phone_number_id}/messages`. | Phase 0 & 2 |
| `WHATSAPP_ACCESS_TOKEN` | `WhatsAppAdapter.sendOutboundMessage` | Permanent System User Access Token with `whatsapp_business_messaging`. | Phase 0 & 2 |
| `FACEBOOK_PAGE_ID` | `MessengerAdapter.sendOutboundMessage` | Facebook Page ID used to send Messenger replies and bind webhooks. | Phase 0 & 4 |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | `MessengerAdapter.sendOutboundMessage` | Page Access Token with `pages_messaging`. Also serves as default fallback for Instagram if both share one Page. | Phase 0 & 4 |
| `INSTAGRAM_PAGE_ID` | `InstagramAdapter` | Facebook Page ID linked to the Instagram Professional account. | Phase 0 & 3 |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | `InstagramAdapter` | Instagram Professional Account ID (IG User ID). Consumed for user profile lookups. | Phase 0 & 3 |
| `INSTAGRAM_ACCESS_TOKEN` | `InstagramAdapter.sendOutboundMessage` | Page Access Token with `instagram_manage_messages` & `instagram_basic` permissions. | Phase 0 & 3 |

---

## 5. Security & Zero-Secret Reporting Policy

> [!CAUTION]
> **MANDATORY SECURITY INVARIANT: ZERO SECRETS IN OUTPUT**  
> To protect production infrastructure and credentials, all agents, engineers, and automated test runners must strictly adhere to the following reporting protocol:
> 1. **Never print or expose real secrets:** Passwords, API keys, access tokens, webhook verify tokens, app secrets, JWT secrets, database connection URLs, session cookies, and authorization headers must **never** appear in terminal output, error logs, screenshots, PRs, or reports.
> 2. **Permitted Status Values:** When verifying configuration in reports or walkthroughs, use only:
>    - `CONFIGURED` (variable is present and non-empty)
>    - `NOT_CONFIGURED` (variable is missing or empty)
>    - Safely redacted representation (e.g. `EAAB...` or `wamid...[redacted]`)
> 3. **Secret Isolation:** Production secrets exist solely in Render environment settings or local untracked `.env`. They are never committed to version control.

---

## 6. Sequential Implementation Phases

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: Meta App, Business Assets & Development Environment Setup           │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 1: Meta Webhook Ingress, Security & Delivery Status Pipeline           │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 2: WhatsApp Business Cloud API Live Integration                        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 3: Instagram Professional Direct Messaging Live Integration            │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 4: Facebook Page Messenger Channel Integration                         │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 5: Inbound Rich Media & Unsupported Payload Handling                   │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 6: Outbound Resilience, Rate Limiting & Messaging Window UX            │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 7: Meta App Review, Permissions & Production Verification              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 0: Meta App, Business Assets & Development Environment Setup

> **Status:** `[COMPLETED — CONFIGURATION & DOCUMENTATION READINESS]`  
> **Execution Date:** 2026-09-14  
> **External Prerequisites:** Pending live asset provisioning from Frank (detailed below).

#### 1. Objective
Provision and configure all prerequisite Meta developer assets, business manager accounts, system user tokens, and development webhook tunnels required to conduct live end-to-end testing in **Development Mode** before changing application code or waiting for Meta App Review.

#### 2. Scope & Deliverables Completed
- **Architecture & Consumer Mapping:** Documented every required Meta variable in [backend/.env.example](file:///Users/abrahamogbu/Developer/frankly-crm/backend/.env.example) with its exact consuming adapter/service.
- **Zero-Secret Compliance Guardrails:** Established strict security rule: zero secrets printed in terminal, logs, or test reports; all status reported as `CONFIGURED` or `NOT_CONFIGURED`.
- **Baseline Test Verification:** Ran full backend unit test suite (17 test files, 121 tests passed) confirming existing channel adapters, webhooks, and auth functions operate cleanly with zero regressions.
- **Environment Status Audit:** Performed read-only audit of current backend environment configuration:
  - `PROVIDER_MODE`: `CONFIGURED` (currently set to `mock` for safe local testing)
  - `META_GRAPH_API_VERSION`: `CONFIGURED` (`v26.0`)
  - `META_VERIFY_TOKEN`: `CONFIGURED`
  - `META_APP_ID`: `NOT_CONFIGURED` (pending input from Frank)
  - `META_APP_SECRET`: `NOT_CONFIGURED` (pending input from Frank)
  - `WHATSAPP_BUSINESS_ACCOUNT_ID`: `NOT_CONFIGURED` (pending input from Frank)
  - `WHATSAPP_PHONE_NUMBER_ID`: `NOT_CONFIGURED` (pending input from Frank)
  - `WHATSAPP_ACCESS_TOKEN`: `NOT_CONFIGURED` (pending input from Frank)
  - `INSTAGRAM_PAGE_ID`: `NOT_CONFIGURED` (pending input from Frank)
  - `INSTAGRAM_BUSINESS_ACCOUNT_ID`: `NOT_CONFIGURED` (pending input from Frank)
  - `INSTAGRAM_ACCESS_TOKEN`: `NOT_CONFIGURED` (pending input from Frank)
  - `FACEBOOK_PAGE_ID`: `NOT_CONFIGURED` (pending input from Frank)
  - `FACEBOOK_PAGE_ACCESS_TOKEN`: `NOT_CONFIGURED` (pending input from Frank)

#### 3. Exact Meta Assets & Inputs Required from Frank

To transition from mocked development to live sandbox messaging in subsequent phases, Frank / the business owner must provide or execute the following:

| Step | Requirement / Asset | Required Input / Action from Frank | Destination in CRM |
|---|---|---|---|
| **0.1** | **Meta Developer App** | Create a **Business App** in [Meta for Developers](https://developers.facebook.com/apps/). Add products: **WhatsApp**, **Instagram Graph API**, and **Messenger**. | Provide `META_APP_ID` and `META_APP_SECRET`. |
| **0.2** | **WhatsApp Business Account (WABA)** | In [Meta Business Manager](https://business.facebook.com/), create or link WABA. In WhatsApp > API Setup, add a test phone number or register a dedicated business phone number. | Provide `WHATSAPP_BUSINESS_ACCOUNT_ID` and `WHATSAPP_PHONE_NUMBER_ID`. |
| **0.3** | **Facebook Page & Messenger** | Ensure Frankly Edu Global Facebook Page is active. Grant Admin access to the Meta Developer App. | Provide `FACEBOOK_PAGE_ID`. |
| **0.4** | **Instagram Professional Linkage** | 1. Convert Frankly Instagram account to Professional (Business or Creator).<br>2. Link Instagram account to Frankly's Facebook Page.<br>3. In Instagram Mobile App: Go to **Settings > Messages & Story Replies > Message Controls**, and toggle **"Allow Access to Messages"** to **ON**. | Provide `INSTAGRAM_BUSINESS_ACCOUNT_ID` (numerical IG User ID). |
| **0.5** | **Permanent System User Token** | In Meta Business Manager > Users > System Users:<br>1. Create an Admin System User.<br>2. Assign assets (WABA, Facebook Page, Instagram Account).<br>3. Generate token with scopes:<br>   - `whatsapp_business_messaging`<br>   - `whatsapp_business_management`<br>   - `instagram_manage_messages`<br>   - `instagram_basic`<br>   - `pages_manage_metadata`<br>   - `pages_read_engagement`<br>   - `pages_messaging` | Provide permanent token as `WHATSAPP_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, and `FACEBOOK_PAGE_ACCESS_TOKEN` (or shared Page token). |
| **0.6** | **App Roles (Sandbox Access)** | In Meta Developer App Dashboard > App Roles, add the development team's Facebook accounts as **Developers** or **Testers**. Add their Instagram test accounts as **Instagram Testers**. | Enables zero-App-Review live testing during Phases 2, 3, and 4. |

#### 4. Webhook Ingress & Development Tunnel Specification
- **Local Development URL:** When testing locally, a secure HTTPS tunnel (e.g. Cloudflare Tunnel or ngrok) must route to port 4000:
  - WhatsApp: `https://<tunnel-domain>/api/v1/webhooks/whatsapp`
  - Instagram: `https://<tunnel-domain>/api/v1/webhooks/instagram`
  - Messenger: `https://<tunnel-domain>/api/v1/webhooks/messenger`
- **Verify Token:** The value configured in `META_VERIFY_TOKEN` (e.g. `frankly_test_verify_token` or production secret).
- **Subscribed Fields in Meta Dashboard:**
  - WhatsApp: `messages`
  - Instagram: `messages`, `message_deliveries`, `message_reads`
  - Facebook Page: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`

#### 5. Validation Results
- **Automated Unit Tests:** 17/17 test files passed, 121/121 tests passed (`npm --prefix backend run test:unit`).
- **Security Check:** Verified that no credentials, tokens, or secrets are logged or committed.
- **Fail-Closed Verification:** Existing adapters verify `x-local-fixture-test` in development and strictly fail closed if live mode is activated without credentials.

#### 6. Blockers & Decisions
- **Blocker:** Live testing cannot proceed beyond mocked data until Frank provisions the Meta Developer App, WABA, and System User Token (Steps 0.1–0.5 above).
- **Decision:** Engineering will proceed with **Phase 1: Meta Webhook Ingress, Security & Delivery Status Pipeline**, which hardens signature verification, challenge handling, and message status updates using deterministic unit tests and simulated Meta payloads while Frank provisions the external Meta assets.


---

### Phase 1: Meta Webhook Ingress, Security & Delivery Status Pipeline

> **Status:** `[COMPLETED]`  
> **Execution Date:** 2026-09-14  
> **Schema Migration:** None required (mapped read receipts to `rawPayload.readAt` while preserving `MessageStatus.DELIVERED`).

#### 1. Objective
Establish a centralized, hardened webhook ingress layer for all Meta webhooks (`/whatsapp`, `/instagram`, `/messenger`), implement a shared HMAC SHA-256 signature verification service, and build the message status event pipeline so that delivery callbacks (`sent`, `delivered`, `read`, `failed`) update Frankly CRM messages in real time.

#### 2. Scope & Deliverables Completed
- **Shared Signature & Challenge Utility:** Implemented [meta-signature.util.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/utils/meta-signature.util.ts):
  - Constant-time HMAC SHA-256 verification using `crypto.timingSafeEqual` against `req.rawBody`.
  - Fail-closed behavior in `NODE_ENV=production` or `PROVIDER_MODE=live` when `META_APP_SECRET` is missing.
  - Centralized GET challenge handshake verification (`verifyMetaChallengeToken`) for `hub.mode=subscribe` and verify token matching.
- **Shared Channel Interface & Adapters:**
  - Added `NormalizedStatusUpdate` interface and `normalizeStatusUpdates` optional method to [channel-adapter.interface.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/adapters/channel-adapter.interface.ts).
  - Updated [whatsapp.adapter.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/adapters/whatsapp.adapter.ts) to delegate signature checks to `verifyMetaSignature` and parse `entry[].changes[].value.statuses[]` (`delivered`, `read`, `failed` with error subcodes).
  - Updated [instagram.adapter.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/adapters/instagram.adapter.ts) to delegate signature checks to `verifyMetaSignature`.
- **Status Ingestion & Persistence Engine:**
  - Implemented `WebhookService.updateMessageStatus` in [webhook.service.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/webhook.service.ts):
    - Monotonic state transition hierarchy: `PENDING` -> `SENT` -> `DELIVERED`.
    - Terminal failure state: `FAILED` records error codes and failure reason.
    - Idempotent read receipts: records `readAt` and `deliveredAt` in `rawPayload` without regressing status.
    - Idempotent duplicate protection: repeated deliveries or out-of-order receipts do not corrupt state.
- **Webhook Ingress Routing:**
  - Updated [webhook.controller.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/webhook.controller.ts) to process normalized status callbacks alongside inbound messages in a single atomic request.
  - Registered `GET /api/v1/webhooks/messenger` and informative `POST /api/v1/webhooks/messenger` in [webhook.routes.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/webhook.routes.ts).
- **Deterministic Fixtures & Tests:**
  - Created status fixtures: [whatsapp-status-delivered.fixture.json](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/fixtures/whatsapp-status-delivered.fixture.json), [whatsapp-status-read.fixture.json](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/fixtures/whatsapp-status-read.fixture.json), and [whatsapp-status-failed.fixture.json](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/fixtures/whatsapp-status-failed.fixture.json).
  - Created unit tests in [meta-signature.test.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/tests/unit/meta-signature.test.ts) and [whatsapp-status.test.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/tests/unit/whatsapp-status.test.ts).
  - Created integration tests in [meta-webhooks.test.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/tests/integration/meta-webhooks.test.ts).

#### 3. Database & Schema Changes
- **No DDL / Schema Migration Needed:** `MessageStatus` currently contains `PENDING`, `RECEIVED`, `SENT`, `DELIVERED`, and `FAILED`. Read receipts map to `DELIVERED` status with timestamp recorded in `rawPayload.readAt`. This avoided unnecessary schema modifications while remaining 100% compliant with existing UI delivery checkmarks.

#### 4. Validation Results
- **Unit Tests:** 19/19 files passed, 140/140 tests passed (`npm --prefix backend run test:unit`).
- **Integration Tests:** 13/13 files passed, 119/119 tests passed (`npm --prefix backend run test:integration` against isolated local `frankly_crm_test`).
- **Backend Typecheck:** Passed with zero TypeScript errors (`tsc --noEmit`).
- **Backend Lint:** Passed with zero errors (`eslint .`).
- **Backend Production Build:** Passed cleanly (`npm --prefix backend run build`).
- **Frontend Regression Suite:** All 45 tests passed, lint passed, production build passed (`npm --prefix frontend run build`).
- **Security Check:** Zero secrets exposed in git diff, test logs, or terminal output.


---

### Phase 2: WhatsApp Business Cloud API Live Integration

> **Status:** `[COMPLETED — ENGINE & 24H WINDOW ENFORCEMENT; LIVE META SEND PENDING FRANK'S CREDENTIALS]`  
> **Execution Date:** 2026-09-14  
> **Schema Migration:** None required.

#### 1. Objective
Enable reliable two-way WhatsApp communication via Meta Cloud API v26.0+, correctly formatting outbound payloads, capturing WhatsApp Message IDs (`wamid`), enforcing the 24-hour customer service window, preserving inbound media captions, validating webhook tenant accounts, and exposing messaging window status directly to the Inbox.

#### 2. Policy Verification Task (Verified)
- **Official Meta Cloud API Documentation Verified:**
  - Graph API messages endpoint: `POST https://graph.facebook.com/v26.0/{phone-number-id}/messages`.
  - 24-Hour Customer Service Window: Opened strictly by customer inbound messages (`messages[].timestamp`). Outbound messages, delivery events, and read receipts do not extend the window.
  - Expired window returns Meta error code `131047` (subcode `2494010`).
  - Outside the 24h window, free-form text is rejected and approved templates are required.
  - Recipient phone formatting: digits only in international format without `+` (e.g. `35799445566`).

#### 3. Scope & Deliverables Completed
- **Environment & Canonical Configuration:**
  - Added `WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional()` to [env.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/config/env.ts).
  - Confirmed `WHATSAPP_ACCESS_TOKEN` as the single canonical token variable across backend and `.env.example`.
- **Tenant & Account Webhook Filtering:**
  - Updated [whatsapp.adapter.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/adapters/whatsapp.adapter.ts) to filter incoming entries by `WHATSAPP_BUSINESS_ACCOUNT_ID` and phone changes by `WHATSAPP_PHONE_NUMBER_ID` when configured.
- **Inbound Media Caption Preservation:**
  - Enhanced `normalizeInboundPayload` in [whatsapp.adapter.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/adapters/whatsapp.adapter.ts) to extract captions for `image`, `video`, `document`, `audio`, and `location` message types so customer typed context is preserved in the CRM message body.
- **Centralized Meta Graph API Error & Subcode Normalizer:**
  - Implemented `parseMetaGraphError` in [whatsapp.adapter.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/webhooks/adapters/whatsapp.adapter.ts):
    - `131047` / `2494010` -> `WHATSAPP_WINDOW_EXPIRED` (HTTP 422)
    - `131026` -> `WHATSAPP_RECIPIENT_NOT_ON_WHATSAPP` (HTTP 422)
    - `130429` / `80007` / `429` -> `WHATSAPP_RATE_LIMIT_EXCEEDED` (HTTP 429)
    - `190` / `401` -> `BadGatewayError` (Meta system user access token expired)
    - `131042` -> `BadGatewayError` (WABA payment issue)
    - `100` -> `BadRequestError` (HTTP 400)
- **24-Hour Customer Service Window Enforcement:**
  - Updated `ConversationService.sendOutboundMessage` in [conversation.service.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/src/modules/conversations/conversation.service.ts):
    - Queries the customer's latest inbound message for the conversation.
    - Inspects the provider timestamp (`rawPayload.timestamp` / `createdAt`).
    - Throws `UnprocessableEntityError('Customer service window expired (>24h)...', 'WHATSAPP_WINDOW_EXPIRED')` before calling Meta API if >24h elapsed or if no customer inbound message exists.
    - Ensures outbound, delivery, or read events never extend the customer service window.
  - Updated `ConversationService.getConversationById` to expose `messagingWindow: { isOpen: boolean, expiresAt: string | null, latestInboundTimestamp: string | null }`.
- **Frontend Inbox Integration & User Guidance:**
  - Updated [types.ts](file:///Users/abrahamogbu/Developer/frankly-crm/frontend/src/lib/api/types.ts) with `MessagingWindowState`.
  - Updated [inbox.tsx](file:///Users/abrahamogbu/Developer/frankly-crm/frontend/src/routes/inbox.tsx):
    - Displays an amber warning banner above the composer when the 24h WhatsApp window is expired.
    - Shows an active window indicator in the composer footer when the 24h window is open.
    - Surfaces specialized toast error messages when `WHATSAPP_WINDOW_EXPIRED`, `WHATSAPP_RECIPIENT_NOT_ON_WHATSAPP`, or `WHATSAPP_RATE_LIMIT_EXCEEDED` occurs.
- **Automated Tests:**
  - Created [whatsapp-adapter.test.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/tests/unit/whatsapp-adapter.test.ts) covering error mappings, media captions, tenant filtering, and mock vs live mode fail-closed behavior.
  - Created [whatsapp-messaging-window.test.ts](file:///Users/abrahamogbu/Developer/frankly-crm/backend/tests/integration/whatsapp-messaging-window.test.ts) testing active window delivery, expired window 422 rejection, cold outbound rejection, non-extension from outbound messages, and `getConversationById` window state.
  - Updated [inbox.test.tsx](file:///Users/abrahamogbu/Developer/frankly-crm/frontend/src/test/inbox.test.tsx) testing expired window banner, active window indicator, and error toast handling.

#### 4. Validation Results
- **Backend Unit Tests:** 20/20 files passed, 157/157 tests passed (`npm --prefix backend run test:unit`).
- **Backend Integration Tests:** 14/14 files passed, 123/123 tests passed (`npm --prefix backend run test:integration` against isolated `frankly_crm_test`).
- **Backend Typecheck:** Clean (`tsc --noEmit` exited 0).
- **Backend Lint:** Clean (`eslint .` exited 0).
- **Backend Build:** Clean (`npm --prefix backend run build` exited 0).
- **Frontend Tests:** 7/7 files passed, 48/48 tests passed (`npm --prefix frontend run test`).
- **Frontend Lint:** Clean (`eslint .` exited 0).
- **Frontend Build:** Clean (`npm --prefix frontend run build` exited 0).
- **Production Safety:** Zero production DB connections, provider calls, migrations, or secret exposures.

#### 5. Remaining Live Meta Dependencies (Frank)
- Permanent System User Access Token (`WHATSAPP_ACCESS_TOKEN`).
- WhatsApp Business Account ID (`WHATSAPP_BUSINESS_ACCOUNT_ID`).
- Phone Number ID (`WHATSAPP_PHONE_NUMBER_ID`).
- Registering Webhook URL in Meta App Dashboard pointing to `/api/v1/webhooks/whatsapp`.

---

### Phase 3: Instagram Professional Direct Messaging Live Integration

#### 1. Objective
Fix the critical Instagram IGSID recipient bug, link the Instagram Professional Account with the Facebook Page, and enable reliable two-way Instagram Direct messaging with support for the 7-day `HUMAN_AGENT` message tag.

#### 2. Policy Verification Task
- **Verify before coding:** Check current Meta documentation regarding the `HUMAN_AGENT` message tag for Instagram Direct in Graph API v26.0. Confirm whether `HUMAN_AGENT` requires dedicated App Review approval or is included under `instagram_manage_messages`.

#### 3. Scope & Deliverables
- **Fix IGSID Routing Bug:** Capture `event.sender.id` (numerical IGSID) as the canonical `channelThreadId` in `Conversation`. Do **not** route outbound messages to username handles.
- **Profile Name Enrichment:** Implement optional profile query `GET /{IGSID}?fields=name,username` using the Page Access Token to resolve user display names when omitted in webhooks.
- **`HUMAN_AGENT` Message Tag:** For outbound agent replies sent between 24 hours and 7 days after customer's last message, attach `"tag": "HUMAN_AGENT"` to extend the messaging window.
- **Window Expiration Enforcement:** Outside 7 days, reject outbound sends with `INSTAGRAM_WINDOW_EXPIRED`.

#### 4. Dependencies
- Phase 0 completed (Instagram Professional account linked to Facebook Page; "Allow Access to Messages" toggled ON).
- Phase 1 completed.

#### 5. Implementation Tasks
1. Refactor `backend/src/modules/webhooks/adapters/instagram.adapter.ts`:
   - Ensure `externalMessageId` uses `event.message.mid`.
   - Store numeric `event.sender.id` in `inbound.senderIdentifier` as the addressable routing identifier.
   - If `event.sender.username` is available, set `senderName = @username`; otherwise query Meta profile endpoint or fallback to `Instagram User (${sender.id.slice(-4)})`.
   - In `sendOutboundMessage`:
     - Validate `recipientId` is purely numeric IGSID. If an agent manually entered a handle, look up the contact's stored IGSID.
     - Check elapsed time since last inbound message:
       - `< 24 hours`: standard free-form text.
       - `24 hours to 7 days`: send with `"messaging_type": "MESSAGE_TAG"` and `"tag": "HUMAN_AGENT"`.
       - `> 7 days`: throw error informing agent the 7-day human agent window has expired.
2. Update `backend/src/config/env.ts`:
   - Add `INSTAGRAM_BUSINESS_ACCOUNT_ID` to Zod schema.

#### 6. Validation Gates
- **Automated Tests:**
  - Verify normalization preserves numeric IGSID and does not strip digits.
  - Test outbound payload generation with and without `HUMAN_AGENT` tag based on inbound message timestamps.
  - Test rejection when >7 days elapsed.
- **Manual Verification (Meta App Testers):**
  - Send direct message from an Instagram test account to Frankly's Instagram Professional account.
  - Confirm message appears in Frankly CRM Inbox under Instagram channel.
  - Send reply from CRM Inbox and verify direct message delivery in Instagram mobile app.

---

### Phase 4: Facebook Page Messenger Channel Integration

#### 1. Objective
Add Facebook Page Messenger (`MESSENGER`) as a first-class CRM channel, allowing prospective students and property investors messaging Frankly's Facebook Page to be ingested, converted into leads, and managed in the Unified Inbox.

#### 2. Policy Verification Task
- **Verify before coding:** Check current Meta documentation for Facebook Messenger Platform in Graph API v26.0: confirm Page-Scoped ID (PSID) lifetime, standard 24h messaging window, and `HUMAN_AGENT` tag support.

#### 3. Scope & Deliverables
- **Additive Schema Migration:** Add `MESSENGER` to `ChannelType` enum in PostgreSQL and Prisma schema.
- **Messenger Channel Adapter:** Implement `backend/src/modules/webhooks/adapters/messenger.adapter.ts`.
- **Webhook Route Registration:** Expose `GET /api/v1/webhooks/messenger` and `POST /api/v1/webhooks/messenger`.
- **Frontend Badges & Filters:** Update `frontend/src/lib/api/types.ts`, `badges.tsx`, and `inbox.tsx` to display Messenger icon and channel filter.

#### 4. Database & Schema Changes
```sql
-- Additive enum value addition
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'MESSENGER';
```

Prisma schema update:
```prisma
enum ChannelType {
  WHATSAPP
  INSTAGRAM
  MESSENGER
  RESEND_EMAIL
  WEBSITE_FORM
}
```

#### 5. Implementation Tasks
1. Create `backend/src/modules/webhooks/adapters/messenger.adapter.ts`:
   - Handles `object: "page"` webhook events.
   - Extracts `sender.id` (Page-Scoped User ID - PSID) and `recipient.id` (Page ID).
   - In `sendOutboundMessage`:
     - Dispatches to `https://graph.facebook.com/${apiVersion}/me/messages` using `FACEBOOK_PAGE_ACCESS_TOKEN`.
     - Supports `HUMAN_AGENT` tag for replies up to 7 days.
2. Register adapter in `backend/src/modules/webhooks/adapters/channel-registry.ts`.
3. Add webhook routes in `backend/src/modules/webhooks/webhook.routes.ts`:
   ```ts
   router.get('/messenger', (req, res, next) => webhookController.verifyMetaChallenge(req, res, next));
   router.post('/messenger', (req, res, next) => webhookController.handleInbound(req, res, next, ChannelType.MESSENGER));
   ```
4. Frontend updates:
   - In `types.ts`: Add `"MESSENGER"` to `ChannelType`.
   - In `badges.tsx`: Add Facebook Messenger icon (or `MessageSquare`) and label `"Messenger"`.
   - In `inbox.tsx`: Add `MESSENGER` to channel filter pill list.

#### 6. Validation Gates
- **Automated Tests:**
  - Unit tests for `MessengerAdapter` inbound normalization and outbound payload generation.
  - Integration test: full ingest lifecycle from Messenger webhook to Lead and Conversation creation.
  - Frontend component tests for `badges.tsx` and `inbox.tsx` with `MESSENGER` channel.
- **Manual Verification:**
  - Send message to Frankly Facebook Page from a personal Facebook account.
  - Verify message arrives in CRM Inbox, auto-creates a lead, and agent can reply successfully.

---

### Phase 5: Inbound Rich Media & Unsupported Payload Handling

#### 1. Objective
Ensure inbound images, voice notes, PDFs, location shares, and stickers from WhatsApp, Instagram, and Messenger do not fail webhook ingestion or drop critical customer context, while maintaining Frankly CRM's policy against storing raw binary blobs in PostgreSQL.

#### 2. Scope & Deliverables
- **Rich Media Extraction:** Parse media objects across all Meta channels:
  - WhatsApp: `image`, `audio`, `voice`, `document`, `video`, `sticker`, `location`, `contacts`.
  - Instagram & Messenger: `message.attachments` (`image`, `audio`, `video`, `file`, `story_share`).
- **Context-Preserving Text Placeholders:** Generate descriptive inline indicators:
  - `[Image: <caption or filename>]`
  - `[Voice Note: <duration>s]`
  - `[Document: <filename.pdf>]`
  - `[Shared Location: <latitude, longitude>]`
- **Metadata Persistence in `rawPayload`:** Preserve Media ID, MIME type, SHA-256 hash, and file size in `Message.rawPayload` for future on-demand viewing or external storage upload.
- **Media Download Proxy Architecture (Design Specification):** Document the future secure retrieval flow (`GET /{media-id}` → signed temporary URL → stream to private GCS bucket) without implementing heavy storage in this phase.

#### 3. Implementation Tasks
1. In `whatsapp.adapter.ts`:
   - Inspect message type. For non-text types, extract metadata:
     ```ts
     if (msg.type === 'image') {
       body = msg.image?.caption ? `[Image] ${msg.image.caption}` : '[Image Attachment]';
     } else if (msg.type === 'audio') {
       body = msg.audio?.voice ? '[Voice Note]' : '[Audio Attachment]';
     } else if (msg.type === 'document') {
       body = `[Document: ${msg.document?.filename || 'attachment'}]`;
     }
     ```
2. In `instagram.adapter.ts` and `messenger.adapter.ts`:
   - Parse `attachments` array and create descriptive labels (`[Shared Photo]`, `[Shared Reel]`, `[Audio Note]`).
3. Ensure `Message.body` contains the readable placeholder and `Message.rawPayload` retains the complete attachment object.

#### 4. Validation Gates
- **Automated Tests:**
  - Ingest WhatsApp fixture containing photo with caption. Verify lead created with readable body.
  - Ingest WhatsApp voice note fixture. Verify duration is noted.
  - Ingest Instagram attachment fixture. Verify graceful handling.
  - Confirm database contains zero binary base64 strings.

---

### Phase 6: Outbound Resilience, Rate Limiting & Messaging Window UX

#### 1. Objective
Prevent agent frustration by introducing clear visual indicators in the Inbox when a customer's 24-hour / 7-day messaging window has expired, gracefully handling Meta rate limits (API calls per second), and persisting failed delivery states with actionable error messages.

#### 2. Scope & Deliverables
- **Inbox Window Warning Banner:** Render an informative banner above the composer when the active conversation's messaging window is closed:
  - WhatsApp: *"The 24-hour customer service window for this WhatsApp conversation closed on [Time]. WhatsApp requires a template message to re-engage."*
  - Instagram / Messenger: *"The 7-day human agent window for this conversation closed on [Time]. You cannot send free-form replies until the user messages again."*
- **Composer Disable State:** Disable the send button if the window is strictly closed, preventing unnecessary failed API calls.
- **Outbound Failure Persistence:** If Graph API returns an error, mark `Message.status = FAILED` and save the error message in `Message.rawPayload`.
- **Sliding-Window Rate Limiter:** Add an in-memory client-side throttling wrapper for Meta API requests to stay within Meta's rate limits (80 calls/sec for WhatsApp, 200 calls/hour for Instagram Page).

#### 3. Implementation Tasks
1. In `frontend/src/routes/inbox.tsx`:
   - Compute window expiration based on `convDetail.messages`: find the most recent `INBOUND` message.
   - For WhatsApp: if `Date.now() - latestInbound.createdAt > 24h`, display the window warning banner.
   - For Instagram / Messenger: if `Date.now() - latestInbound.createdAt > 7d`, display the 7-day warning banner.
2. In `backend/src/modules/conversations/conversation.service.ts`:
   - Catch `BadGatewayError` from channel adapters during outbound dispatch.
   - Transactionally record the message as `status: MessageStatus.FAILED`, with error details in `Message.rawPayload`.
   - Return structured error response so the frontend displays a toast explaining why the message failed.

#### 4. Validation Gates
- **Automated Tests:**
  - Frontend test verifying warning banner renders when last inbound message is 25 hours old.
  - Backend test verifying outbound failure records `MessageStatus.FAILED` and does not crash the server.
- **Manual Verification:**
  - Verify composer shows clear message when selecting a conversation older than 24 hours.

---

### Phase 7: Meta App Review, Permissions & Production Verification

#### 1. Objective
Prepare all Meta App Review submission assets, configure production Render environment variables, register production webhooks in the Meta App Dashboard, and complete a live end-to-end smoke test across all channels.

#### 2. Scope & Deliverables
- **Meta App Review Submission Package:**
  - Prepare exact permission justifications and screencasts for `whatsapp_business_messaging`, `instagram_manage_messages`, and `pages_messaging`.
  - Provide test credentials and staging URL for Meta App Reviewers.
  - Verify Privacy Policy and Data Deletion callback endpoints are live.
- **Production Render Configuration:**
  - Set `PROVIDER_MODE=live`.
  - Set permanent System User Access Tokens, Page IDs, and WABA ID.
- **Webhook Subscription Verification:**
  - Verify subscription to `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads` in Meta App Dashboard.
- **Final Production Smoke Test & Verification Runbook.**

#### 3. Validation Gates
- **Security Check:**
  - Verify zero secrets are exposed in logs or client bundles.
  - Verify all webhooks reject requests without valid `x-hub-signature-256`.
- **Live Smoke Test:**
  - Real WhatsApp message received → Lead created → Agent replies → Delivered to phone.
  - Real Instagram DM received → Lead created → Agent replies → Delivered to IG app.
  - Real Facebook Messenger message received → Lead created → Agent replies → Delivered to Messenger.

---

## 7. What Remains Mocked vs. What Becomes Live

| Capability | In `PROVIDER_MODE=mock` (Local Dev & Automated CI) | In `PROVIDER_MODE=live` (Production / Staging) |
|---|---|---|
| **Inbound Webhook Verification** | Allows local fixture test header `x-local-fixture-test: true` or valid HMAC signature | **Strictly fails closed**: rejects any request lacking a valid `x-hub-signature-256` matching `META_APP_SECRET` |
| **Outbound WhatsApp** | Generates simulated `externalMessageId` (`wa_out_...`), returns `{ success: true, simulated: true }` | Dispatches real HTTPS POST to `https://graph.facebook.com/v26.0/{phone_number_id}/messages` |
| **Outbound Instagram** | Generates simulated `externalMessageId` (`ig_out_...`), returns `{ success: true, simulated: true }` | Dispatches real HTTPS POST to `https://graph.facebook.com/v26.0/me/messages` with numerical IGSID |
| **Outbound Messenger** | Generates simulated `externalMessageId` (`fb_out_...`), returns `{ success: true, simulated: true }` | Dispatches real HTTPS POST to `https://graph.facebook.com/v26.0/me/messages` with numerical PSID |
| **Automated Test Suite** | 100% runs against local mock adapters using `frankly_crm_test` database. Zero Meta API calls or costs | Tests run in staging with designated Meta App Testers |

---

## 8. Explicit Blockers & Decisions for Stakeholder Review

Before starting Phase 0 implementation, the following decisions and prerequisites must be aligned:

1. **Meta Business Account Access:**
   - Who will be the primary administrator on Frankly Edu Global’s Meta Business Portfolio to approve the System User token creation?
2. **Dedicated WhatsApp Phone Number:**
   - What phone number will be used for WhatsApp Cloud API? (Note: A phone number registered with WhatsApp Cloud API cannot be actively registered on the consumer WhatsApp mobile app simultaneously; it requires an unlinked number or dedicated virtual line).
3. **Instagram Professional Account Linking:**
   - Has the Frankly Instagram account been converted to a Professional (Business or Creator) account and connected to Frankly’s Facebook Page?
   - Has **"Allow Access to Messages"** been confirmed ON in the Instagram mobile app settings?
4. **App Review Timing:**
   - Phases 0 through 6 can be fully built, tested, and validated in **Development Mode** using team Facebook/Instagram accounts added as App Testers. Live public customer messaging (outside App Testers) requires App Review completion in Phase 7.
