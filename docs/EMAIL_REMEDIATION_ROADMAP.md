# Frankly CRM — Email Upgrade & Remediation Roadmap

> **Document Type:** Architectural & Implementation Roadmap  
> **Target Subsystem:** Unified Inbox & Email Channel (`RESEND_EMAIL`)  
> **Parent Roadmap:** [docs/ROADMAP.md](file:///Users/abrahamogbu/Developer/frankly-crm/docs/ROADMAP.md) (Overarching CRM Roadmap)  
> **Status:** `[PLANNED]` — Ready for sequential phase execution  
> **Execution Mode:** Read-only planning artifact. Zero application code or database migrations have been executed.

---

## 1. Purpose & Scope

### 1.1 What This Roadmap Solves
This document defines the sequential remediation plan for Frankly CRM's email infrastructure. Based on real-world inbound testing and the completed Email Threading Architectural Audit, this roadmap resolves:
1. **Broken External Threading:** Outbound CRM email replies currently spawn detached, new email threads in client mail applications (Gmail, Outlook, Apple Mail) due to missing `In-Reply-To` and `References` headers and generic subject lines.
2. **Dropped RFC Metadata:** Inbound RFC 5322 `Message-ID`, `In-Reply-To`, `References`, and `Subject` are discarded during Receiving API normalization.
3. **Webhook Concurrency & Idempotency Gaps:** Concurrent webhook deliveries for the same email trigger unhandled database unique constraint errors (`P2002`), causing HTTP 500s and webhook retry storms.
4. **Sender Identity Loss:** Inbound sender display names are parsed but never persisted to the `Message` model.
5. **Storage Inefficiencies & Risks:** Unbounded email body sizes and storage of full duplicate HTML in `rawPayload` create database bloat risks.
6. **Thread Splitting & Query Inefficiencies:** Lack of composite database indexes and unread-filtering full-table scans.
7. **Receiving API Fragility:** Transient 429/5xx errors from Resend's Receiving API silently degrade emails to subject-only fallbacks.
8. **Inbox UX Gaps:** Non-clickable plain-text URLs and lack of automatic inbox refresh for incoming messages.

### 1.2 What This Roadmap Deliberately Does NOT Attempt to Solve
To prevent scope creep and overengineering at Frankly CRM's current operating scale, the following are **explicitly deferred**:
- **Attachment Storage & Binaries:** No attachment pipeline, virus scanner, or cloud object storage will be introduced in this cycle.
- **Asynchronous Queues & Background Workers:** No Redis, BullMQ, or separate worker services will be introduced.
- **Full-Text Search (FTS) Engines:** No Elasticsearch or PostgreSQL GIN `tsvector` indexes will be added.
- **WebSockets / Server-Sent Events:** No persistent socket server infrastructure will be added for inbox freshness.

---

## 2. Current Architecture & Verified Baseline

### 2.1 Inbound Routing Path (Must Remain Intact)
```
External Sender
      │
      ▼
Google Workspace (MX: frankedu-global.com)
      │  [Inbound Routing Rule: Dual Delivery envelope filter on emmanuel@frankedu-global.com]
      ├───────────────────────────────────┐
      ▼                                   ▼
Emmanuel's Primary Gmail Inbox       frankly@huejoraata.resend.app (Resend Inbound Managed Address)
                                          │
                                          ▼ [Webhook: email.received]
                                     Frankly CRM Backend (Render)
                                     POST /api/v1/webhooks/resend
```
> [!IMPORTANT]
> **Production Invariant:** Google Workspace DNS, MX records, SPF/DKIM, Gmail routing rules, and Resend domain configuration are operational and verified. They **must not be modified** during any remediation phase.

### 2.2 Verified Identifier & Header Differentiation

| Field | Nature | Where It Originates | Where It Currently Lives in Frankly CRM |
|---|---|---|---|
| **Resend `email_id`** | Internal UUID | Resend Inbound/Outbound Engine | Stored in `Message.externalMessageId` |
| **RFC 5322 `Message-ID`** | Mail Standard ID (`<...cab@mail.gmail.com>`) | Originating Mail Transfer Agent (MTA) | **Discarded** by `fetchReceivedEmailContent()` |
| **`In-Reply-To`** | RFC 5322 Parent ID | Sender Client Mail Client | **Discarded** by `fetchReceivedEmailContent()` |
| **`References`** | RFC 5322 Chain | Sender Client Mail Client | **Discarded** by `fetchReceivedEmailContent()` |
| **`Subject`** | Email Subject Line | Sender Client | Discarded if body fetched; missing from `Message` model |

### 2.3 Verified Resend API Behaviors
1. **`GET /emails/receiving/:email_id`**: Returns `{ id, text, html, subject, headers }`. The `headers` object contains lowercased or original RFC headers (`message-id`, `in-reply-to`, `references`, `subject`).
2. **`POST https://api.resend.com/emails`**: Accepts `headers: { 'In-Reply-To': '...', 'References': '...' }`. The synchronous HTTP 200 response returns **only** `{ "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }`. It does **not** return the RFC `Message-ID`.
3. **`GET https://api.resend.com/emails/:id`**: Exposes the outbound RFC `message_id` after dispatch.
4. **`email.sent` / `email.delivered` Webhooks**: Expose `data.message_id` asynchronously.

---

## 3. Design Principles

1. **Security First**: Trust boundaries are absolute. Never render raw inbound HTML. Never use tag-stripping regexes as security sanitizers. Reject header CR/LF injection.
2. **Additive & Backward-Compatible**: All schema changes must use nullable fields or default values. Existing conversation history, mock fixtures, and non-email channels (WhatsApp, Instagram, Website Form) must not break.
3. **No Unnecessary Infrastructure**: Solve current problems with the existing stack (Node.js, Express, PostgreSQL, Prisma, TanStack Query). Avoid adding Redis, RabbitMQ, or Docker containers prematurely.
4. **Zero Secrets in Logs or Source**: API keys, webhook signing secrets, and authorization headers must never be logged or serialized in error outputs.
5. **No Binaries in PostgreSQL**: Binary or base64 attachment data must never be saved in PostgreSQL.
6. **Channel Isolation**: Email-specific logic must remain encapsulated inside `ResendEmailAdapter` and isolated helper services.
7. **Rigorous Verification Gates**: Never mark a phase complete based on code writing alone. Every phase must satisfy strict automated and manual validation gates.

---

## 4. Sequential Implementation Phases

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Email Reply Threading & Message Metadata                            │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 2: Webhook Idempotency & Concurrent Delivery Safety                     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 3: Sender Metadata & Safe Message Storage                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 4: Conversation Uniqueness & Database Integrity                        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 5: Inbox Query Performance & Unread State                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 6: Resend Receiving API Resilience                                     │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 7: Safe URL Linkification                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────┐
│ PHASE 8: Inbox Freshness & Active Polling                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### PHASE 1 — Email Reply Threading & Message Metadata

- **Objective**: Establish end-to-end email threading so CRM replies appear nested within the customer's existing email thread in external mail clients.
- **Exact Scope**:
  - Add first-class `subject`, `rfcMessageId`, `inReplyTo`, and `references` to the `Message` model.
  - Update `ResendEmailAdapter.fetchReceivedEmailContent()` to extract `headers` and `subject`.
  - Update `NormalizedInboundMessage` to include RFC metadata.
  - Update `ConversationService.sendOutboundMessage()` to resolve conversation thread context, build standard `In-Reply-To` and `References` headers, normalize subjects with `Re: `, and validate against CR/LF injection.
  - Transmit `In-Reply-To` and `References` headers in `POST https://api.resend.com/emails`.
  - Distinguish `externalMessageId` (Resend UUID) from `rfcMessageId` (RFC 5322 string).
- **Affected Files / Modules**:
  - `backend/prisma/schema.prisma`
  - `backend/src/modules/webhooks/adapters/channel-adapter.interface.ts`
  - `backend/src/modules/webhooks/adapters/resend.adapter.ts`
  - `backend/src/modules/webhooks/webhook.service.ts`
  - `backend/src/modules/conversations/conversation.service.ts`
  - `backend/src/modules/conversations/conversation.schemas.ts`
  - `backend/tests/unit/channel-adapters.test.ts`
  - `backend/tests/unit/provider-adapters.test.ts`
  - `backend/tests/integration/webhooks.test.ts`
- **Schema & Migration Impact**:
  ```prisma
  model Message {
    // ... existing fields
    subject             String?
    rfcMessageId        String?          @unique
    inReplyTo           String?
    references          String?
  }
  ```
  - Migration is purely additive (`ALTER TABLE "messages" ADD COLUMN ...`).
  - No default values required; existing messages retain `null` values.
- **Implementation Requirements**:
  1. *Header Extraction*: Parse `headers` object case-insensitively from Receiving API (`headers['message-id']`, `headers['in-reply-to']`, `headers['references']`).
  2. *References Preservation*: Do **not** set `References` as merely `[latestInboundId]`. Build the chain: take the incoming message's existing `references` string, append the incoming message's `rfcMessageId` (if not already present), and delimit with spaces.
  3. *Subject Normalization*: If the inbound subject is `"Property Inquiry"`, the reply subject must be `"Re: Property Inquiry"`. If it already starts with `Re:` (case-insensitive), do not stack prefixes (e.g. avoid `Re: Re: `).
  4. *CR/LF Header Sanitization*: Strip or reject any Carriage Return (`\r`) or Line Feed (`\n`) in `subject`, `inReplyTo`, and `references` before passing to Resend.
  5. *Outbound RFC Message-ID Strategy*:
     - When sending via `POST /emails`, record Resend's returned UUID in `Message.externalMessageId`.
     - External email clients do **not** require the outbound email's own RFC `Message-ID` to thread the reply—they only require the inbound email's `Message-ID` in `In-Reply-To` and `References`.
     - For outbound CRM records, trigger a non-blocking asynchronous call to `GET https://api.resend.com/emails/:id` (or leave `rfcMessageId` for future webhook sync) without delaying the user's reply response.
  6. *Legacy Compatibility*: If replying to a thread where no previous message has an `rfcMessageId`, send without `In-Reply-To`/`References`, falling back gracefully to standard email delivery.
- **Security Considerations**:
  - Strict CR/LF injection validation prevents SMTP header injection and HTTP request splitting.
  - Do not log raw headers containing sensitive auth tokens or internal routing hops.
- **Tests**:
  - Unit test: verify `normalizeInboundPayload` correctly extracts `rfcMessageId`, `inReplyTo`, `references`, and `subject` from both webhook payload and Receiving API fixtures.
  - Unit test: verify `buildReferencesHeader` preserves multi-hop chains without duplicates.
  - Unit test: verify subject normalization prevents `Re: Re: ` stacking.
  - Unit test: verify CR/LF injection strings are sanitized.
  - Integration test: verify `sendOutboundMessage` passes formatted headers to `fetch` spy when calling Resend.
- **Validation Gates**:
  - `npm run lint` and `npm run build` pass.
  - All existing and new unit/integration tests pass.
  - End-to-end smoke test with personal Gmail account: send email to `emmanuel@frankedu-global.com`, reply from CRM, confirm Gmail groups the reply in the same thread.
- **Rollback Strategy**:
  - Revert code changes in adapter and conversation service.
  - Database columns are nullable and harmless if left in place.
- **Dependencies / Blockers**: None.

---

### PHASE 2 — Webhook Idempotency & Concurrent Delivery Safety

- **Objective**: Prevent HTTP 500 errors and duplicate processing when Resend or Meta delivers identical webhooks concurrently.
- **Exact Scope**:
  - Handle Prisma `P2002` (unique constraint violation) on `externalMessageId` inside `WebhookService.ingestInboundMessage`.
  - Re-query existing message, conversation, contact, and lead, returning an idempotent `deduplicated: true` response.
  - Maintain compatibility across all channels (WhatsApp, Instagram, Email, Website Form).
- **Affected Files / Modules**:
  - `backend/src/modules/webhooks/webhook.service.ts`
  - `backend/src/modules/webhooks/webhook.controller.ts`
  - `backend/tests/integration/webhooks.test.ts`
- **Schema & Migration Impact**: None. `Message.externalMessageId` already has a `@unique` constraint.
- **Implementation Requirements**:
  1. In `WebhookService.ingestInboundMessage`: keep the pre-transaction `findUnique` check as an optimization.
  2. Inside or wrapping `prisma.$transaction`, catch `PrismaClientKnownRequestError` with `code === 'P2002'`.
  3. If target of `P2002` is `externalMessageId`:
     - Log an `INFO` message: `"Concurrent duplicate webhook resolved for externalMessageId: <id>"`.
     - Re-query the existing message with its relations (`conversation.contact`, `conversation.lead`).
     - Return `{ message, conversation, contact, lead, deduplicated: true }`.
  4. Ensure `WebhookController` returns HTTP 200 `{ success: true, data: { deduplicated: true, ... } }` so providers do not retry.
- **Security Considerations**:
  - Prevents denial-of-service and state-corruption risks from webhook retry storms.
- **Tests**:
  - Concurrency test: execute `Promise.all([ingest(payload), ingest(payload)])` simultaneously with the same `externalMessageId`. Assert both resolve with HTTP 200, exactly one creates records, and the other returns `deduplicated: true`.
- **Validation Gates**:
  - Automated concurrency test passes reliably without intermittent failures.
- **Rollback Strategy**: Revert `try/catch` wrapper in `webhook.service.ts`.
- **Dependencies / Blockers**: Phase 1 complete.

---

### PHASE 3 — Sender Metadata & Safe Message Storage

- **Objective**: Persist inbound sender display names and establish evidence-based storage guards to prevent unbounded database growth while preserving legitimate emails.
- **Exact Scope**:
  - Add `senderName` to the `Message` model.
  - Update `ResendEmailAdapter` and `WebhookService` to persist `senderName`.
  - Define and enforce an evidence-based plain-text body size limit.
  - Sanitize `rawPayload` to eliminate duplicate storage of large HTML blobs.
  - Maintain strict plain-text rendering security boundaries.
- **Affected Files / Modules**:
  - `backend/prisma/schema.prisma`
  - `backend/src/modules/webhooks/adapters/resend.adapter.ts`
  - `backend/src/modules/webhooks/webhook.service.ts`
  - `frontend/src/routes/inbox.tsx`
  - `backend/tests/unit/channel-adapters.test.ts`
- **Schema & Migration Impact**:
  ```prisma
  model Message {
    // ... existing fields
    senderName          String?
  }
  ```
  - Additive only (`ALTER TABLE "messages" ADD COLUMN "senderName" TEXT`).
- **Implementation Requirements**:
  1. *Sender Name Persistence*: Save extracted `inbound.senderName` into `tx.message.create`.
  2. *Evidence-Based Body Size Limit*:
     - **Selected Cap: 250 KB** (~125,000 to 250,000 characters).
     - *Rationale*: A typical business email body is 2 KB to 25 KB. Lengthy academic transcripts, legal contracts, or multi-year email chains rarely exceed 100 KB in plain text. A 250 KB cap accommodates 99.9% of legitimate emails (equivalent to ~50–100 pages of text) while preventing memory exhaustion and multi-megabyte string serialization attacks.
     - *Oversized Strategy*: If `body.length > 250_000`, truncate to 250,000 characters and append:
       `"\n\n[Message body truncated: content exceeded 250KB display limit]"`
     - Never reject or drop the email; preserve receipt and metadata.
  3. *`rawPayload` Minimization*:
     - If full body text was already extracted, remove large redundant HTML strings (`data.html`, `rawHtml`) from `rawPayload` before storing to avoid storing duplicate multi-megabyte JSONB structures in PostgreSQL.
     - Keep essential forensic envelope metadata: `id`, `from`, `to`, `subject`, `headers`, `created_at`.
  4. *Rendering Boundary*: Keep frontend rendering strictly as escaped React text children (`<p className="whitespace-pre-wrap">{msg.body}</p>`). Do not introduce `dangerouslySetInnerHTML`.
- **Security Considerations**:
  - Protects PostgreSQL memory, network transport, and client DOM rendering from malicious payload bloating.
- **Tests**:
  - Unit test: ingest an email with a 400 KB body, verify it is truncated at 250 KB with notice appended.
  - Unit test: verify `senderName` is saved and returned in conversation message history.
- **Validation Gates**:
  - Unit tests verify truncation and metadata persistence.
  - Frontend Inbox displays sender display name alongside timestamp.
- **Rollback Strategy**: Revert code changes; drop `senderName` column if necessary.
- **Dependencies / Blockers**: Phase 2 complete.

---

### PHASE 4 — Conversation Uniqueness & Database Integrity

- **Objective**: Prevent duplicate conversation threads from being created for the same contact and channel under concurrent messaging.
- **Exact Scope**:
  - Audit existing database records for duplicate `(contactId, channel)` pairs.
  - Apply unique constraint on `(contactId, channel)`.
  - Update `WebhookService` to use race-safe upsert or `P2002` catch-and-retry.
- **Affected Files / Modules**:
  - `backend/prisma/schema.prisma`
  - `backend/prisma/migrations/*`
  - `backend/src/modules/webhooks/webhook.service.ts`
  - `backend/tests/integration/webhooks.test.ts`
- **Schema & Migration Impact**:
  ```prisma
  model Conversation {
    // ...
    @@unique([contactId, channel])
  }
  ```
- **Prisma / PostgreSQL Migration Strategy**:
  - *Pre-Migration Audit*: Run `SELECT "contactId", "channel", COUNT(*) FROM "conversations" GROUP BY "contactId", "channel" HAVING COUNT(*) > 1;`
  - *Resolution*: If duplicates exist in production, execute a data consolidation script merging duplicate conversation message foreign keys to the oldest conversation ID before adding the constraint.
  - *Constraint Creation*: In PostgreSQL, unique indexes can be created concurrently. However, Prisma migrations wrap commands in a transaction block by default, where `CONCURRENTLY` is illegal. Because Frankly CRM's production database has a small row count (<1,000 conversations), a standard transactional `CREATE UNIQUE INDEX` inside a Prisma migration is fast (<20ms) and safe. If concurrent execution is required, use `-- prisma-no-transaction` at the top of the migration file.
- **Implementation Requirements**:
  1. In `WebhookService.ingestInboundMessage`: replace `findFirst` + `create` with an upsert pattern or wrap `tx.conversation.create` in a `P2002` catch block that re-queries the newly created thread.
- **Security Considerations**: Enforces integrity at the database layer rather than relying on application-level locks.
- **Tests**:
  - Concurrency test: trigger two simultaneous inbound webhooks for a brand-new contact. Assert exactly one `Conversation` record is created.
- **Validation Gates**:
  - Migration applies cleanly.
  - Zero duplicate conversation threads can be created under concurrency.
- **Rollback Strategy**: Drop unique index `conversations_contactId_channel_key`.
- **Dependencies / Blockers**: Pre-migration audit confirming zero duplicate rows.

---

### PHASE 5 — Inbox Query Performance & Unread State

- **Objective**: Optimize conversation listing and eliminate unbounded in-memory table scans on the `unreadOnly` filter.
- **Exact Scope**:
  - Add composite indexes on `Conversation`.
  - Replace unbounded raw SQL queries in `ConversationService.listConversations`.
  - Create a dedicated lightweight unread-count endpoint.
- **Affected Files / Modules**:
  - `backend/prisma/schema.prisma`
  - `backend/src/modules/conversations/conversation.service.ts`
  - `backend/src/modules/conversations/conversation.controller.ts`
  - `backend/src/modules/conversations/conversation.routes.ts`
  - `frontend/src/lib/api/queries.ts`
  - `frontend/src/routes/inbox.tsx`
- **Schema & Migration Impact**:
  ```prisma
  model Conversation {
    // ...
    @@index([channel, lastMessageAt(sort: Desc)])
    @@index([lastMessageAt(sort: Desc)])
  }
  ```
- **Implementation Requirements**:
  1. *Index Creation*: Add composite index for channel filtering and date ordering.
  2. *Unread Query Optimization*:
     - Replace the current raw query (`SELECT id FROM conversations WHERE ...` with no LIMIT) by incorporating the unread condition directly into the paginated Prisma query or a bounded SQL query that respects `take` and `skip`.
  3. *Unread Count API*:
     - Add `GET /api/v1/conversations/unread-count` returning `{ unreadCount: number }` using `prisma.conversation.count({ where: { ... } })`.
     - Update frontend inbox badge to consume this endpoint instead of counting only the first 50 loaded items.
- **Security Considerations**: Prevents memory exhaustion attacks against the list endpoint.
- **Tests**:
  - Integration test: verify `unreadOnly` filter correctly returns only unread conversations and respects pagination limit.
  - Integration test: verify `unread-count` endpoint returns accurate count.
- **Validation Gates**:
  - `EXPLAIN ANALYZE` confirms PostgreSQL uses index scans on `lastMessageAt`.
- **Rollback Strategy**: Drop composite indexes and revert service method to previous query.
- **Dependencies / Blockers**: Phase 4 complete.

---

### PHASE 6 — Resend Receiving API Resilience

- **Objective**: Make the email body retrieval resilient against transient 429 rate-limits or 5xx provider glitches without causing webhook timeouts or permanent message loss.
- **Exact Scope**:
  - Add bounded retry with backoff in `ResendEmailAdapter.fetchReceivedEmailContent`.
  - Enforce a strict total request timeout budget.
  - Implement diagnostic metadata tagging on permanent failure.
- **Affected Files / Modules**:
  - `backend/src/modules/webhooks/adapters/resend.adapter.ts`
  - `backend/tests/unit/channel-adapters.test.ts`
- **Schema & Migration Impact**: None.
- **Implementation Requirements**:
  1. *Timeout & Retry Budget*:
     - Initial fetch timeout: 3.5 seconds.
     - If response is 429 or 5xx: wait 500ms and execute exactly 1 retry with a 3-second timeout.
     - Total elapsed time budget capped at $\le 7.5$ seconds (well within Resend's 30-second webhook timeout).
  2. *Graceful Fallback*:
     - If retry fails, do not throw. Fall back to:
       `body = "[Subject: " + subject + "] (Email content retrieval pending)"`
     - Tag rawPayload/metadata:
       `{ contentFetchStatus: "FAILED", statusCode: response.status }`
     - Return HTTP 200 to Resend so it does not hammer the server with retries.
  3. *Sanitized Logging*: Never log API authorization tokens in retry/error log statements.
- **Security Considerations**: Prevents external API downtime from cascading into CRM webhook failures.
- **Tests**:
  - Unit test with mock fetch: verify 500 on attempt 1 followed by 200 on attempt 2 succeeds and returns full body.
  - Unit test: verify persistent 429 falls back to subject line with failure metadata without throwing.
- **Validation Gates**: Unit tests pass using simulated clock/timers.
- **Rollback Strategy**: Revert `fetchReceivedEmailContent` to single-attempt fetch.
- **Dependencies / Blockers**: Phase 1 complete.

---

### PHASE 7 — Safe URL Linkification

- **Objective**: Enable agents to click links in customer messages within the Unified Inbox safely, without exposing the app to XSS or reverse tab-nabbing.
- **Exact Scope**:
  - Create a dedicated React component (`SafeMessageBody`).
  - Tokenize message text into plain text chunks and strictly validated URLs.
  - Whitelist only `https://` and `http://` protocols.
- **Affected Files / Modules**:
  - `frontend/src/components/crm/SafeMessageBody.tsx` (New)
  - `frontend/src/routes/inbox.tsx`
  - `frontend/src/test/SafeMessageBody.test.tsx` (New)
- **Schema & Migration Impact**: None.
- **Implementation Requirements**:
  1. Match URLs with strict regex: `https?:\/\/[^\s<>'"]+`.
  2. Whitelist check: ensure URL starts with `https://` or `http://`. Explicitly reject `javascript:`, `data:`, `file:`, `vbscript:`.
  3. Render matched URLs as:
     ```tsx
     <a
       href={url}
       target="_blank"
       rel="noopener noreferrer"
       className="text-primary underline break-all hover:text-primary/80"
       onClick={(e) => e.stopPropagation()}
     >
       {url}
     </a>
     ```
  4. Render all other text as standard React text children.
  5. **No `dangerouslySetInnerHTML` permitted.**
- **Security Considerations**:
  - Zero XSS risk: no HTML parsing or innerHTML injection.
  - `rel="noopener noreferrer"` blocks `window.opener` exploitation.
- **Tests**:
  - Component test: `"Check https://example.com"` renders clickable `<a>` with `noopener noreferrer`.
  - Component test: `"javascript:alert(1)"` renders as plain text, NOT an anchor tag.
  - Component test: `"<img src=x onerror=alert(1)>"` renders as escaped text characters.
- **Validation Gates**: Component tests pass; manual visual inspection in browser.
- **Rollback Strategy**: Revert `inbox.tsx` to `<p>{msg.body}</p>`.
- **Dependencies / Blockers**: None.

---

### PHASE 8 — Inbox Freshness & Active Polling

- **Objective**: Ensure agents see new incoming inquiries without manually reloading the page, using lightweight client polling.
- **Exact Scope**:
  - Configure TanStack Query polling on `useConversations` and `useConversation`.
  - Pause polling when browser tab is inactive.
  - Invalidate queries on outbound message mutation.
- **Affected Files / Modules**:
  - `frontend/src/lib/api/queries.ts`
  - `frontend/src/routes/inbox.tsx`
- **Schema & Migration Impact**: None.
- **Implementation Requirements**:
  1. Add to conversation queries:
     - `refetchInterval: 15000` (15 seconds).
     - `refetchIntervalInBackground: false` (stops network requests when agent tabs away).
     - `refetchOnWindowFocus: true` (instantly updates when agent refocuses tab).
  2. Outbound `sendMessage` mutation immediately invalidates `conversations` and active `conversation` query cache keys.
  3. Do **not** introduce WebSockets, Socket.io, or Redis pub/sub.
- **Security Considerations**: Standard authenticated bearer requests; negligible server load at current team size.
- **Tests**:
  - Unit test verifying TanStack Query hook configuration options.
- **Validation Gates**:
  - Send email from external account; confirm conversation appears in inbox within 15 seconds without user interaction.
- **Rollback Strategy**: Set `refetchInterval: false`.
- **Dependencies / Blockers**: Phase 5 complete.

---

## 5. Deferred / Future Work

| Capability | What It Entails | Explicit Trigger to Justify Implementation |
|---|---|---|
| **Attachment Pipeline** | Ingesting email PDFs/images, virus scanning, cloud object storage (S3/Supabase Storage), signed download URLs | When students/partners must submit official application documents via email rather than the portal, and manual email forwarding becomes a bottleneck (>50 attachments/week). |
| **Asynchronous Worker Queue** | BullMQ / Redis or `pg-boss` background worker processing webhooks asynchronously | When inbound webhook volume exceeds **20 concurrent messages/second** or Resend webhook timeouts exceed 5 seconds due to server load. |
| **PostgreSQL Full-Text Search (FTS)** | `tsvector` generated column + GIN index on `Message.body` and `Contact.name` | When message row count exceeds **50,000 rows** and `ILIKE '%term%'` search queries take >500ms in production telemetry. |
| **Cursor-Based Keyset Pagination** | Replacing `skip`/`take` with `(lastMessageAt, id)` keyset pagination | When typical agent navigation regularly traverses past **page 20** of conversation history and database query plans show high offset discard costs. |
| **WebSockets / Push Realtime** | Persistent WebSocket connection (Supabase Realtime or Socket.io) | When agent concurrent seat count exceeds **25 active users** and 15-second polling creates noticeable database load. |

---

## 6. Cross-Phase Security Requirements

1. **Header Injection Defense**: Every outbound header (`Subject`, `In-Reply-To`, `References`) must pass through a strict regex sanitizer:
   ```ts
   value.replace(/[\r\n]/g, '').trim()
   ```
2. **URL Scheme Whitelisting**: Frontend linkification must reject any scheme other than `http:` or `https:`.
3. **No Raw HTML Execution**: All inbound email bodies must be displayed as plain text with `whitespace-pre-wrap`. Never pipe email bodies into `innerHTML`.
4. **Credential Isolation**: Resend API keys, webhook secrets, and database connection strings must remain exclusively in server environment variables.
5. **Webhook Signature Validation**: The Svix HMAC SHA-256 signature verification in `ResendEmailAdapter.verifyWebhookSignature()` must never be bypassed in production.
6. **Replay Tolerance**: Svix 5-minute replay protection timestamp check must remain strictly enforced.
7. **Storage Bounding**: Never permit single text payloads >250 KB or un-sanitized multi-megabyte payloads in `rawPayload`.

---

## 7. Testing Strategy

### 7.1 Automated Test Suite Requirements
- **Unit Tests**:
  - Header extraction and case-insensitive matching.
  - Multi-hop `References` chain concatenation and deduplication.
  - Subject normalization (`Re: ` handling without duplication).
  - CR/LF injection sanitization.
  - Body truncation at 250 KB with notice appended.
  - Safe URL parsing and protocol whitelisting.
- **Integration Tests**:
  - Webhook concurrency test: simultaneous identical webhook deliveries return HTTP 200 with `deduplicated: true`.
  - Database uniqueness test: simultaneous conversation creation for same contact/channel results in single conversation.
  - Outbound reply test: verifies Resend `fetch` spy receives correct `headers` and `subject`.
  - Query performance test: `listConversations({ unreadOnly: true })` respects pagination limits without full-table memory scans.

### 7.2 The Canonical Real-World Threading Validation Gate
To verify external email client compatibility, execute the following manual end-to-end test before closing Phase 1:
```
1. External Gmail User sends email:
   To: emmanuel@frankedu-global.com
   Subject: "Admissions Inquiry 2026"
   Body: "Hello Frankly team, I am inquiring about tuition fees."

2. Verify Google Workspace routing copies email to Resend managed address.
3. Verify Frankly CRM Webhook ingests email with rfcMessageId, subject, and body.
4. Agent opens Frankly CRM Inbox and sends reply:
   Body: "Hello, our tuition schedule is attached below."
5. Inspect External Gmail Inbox:
   - Reply arrives from configured sender.
   - Reply is NESTED inside the identical "Admissions Inquiry 2026" thread (NOT a separate email).
   - Subject is "Re: Admissions Inquiry 2026".
6. External Gmail User clicks "Reply" in Gmail:
   Body: "Thank you for the quick response."
7. Verify Frankly CRM receives reply and appends to the same conversation timeline.
8. Agent sends second reply from CRM:
   - External Gmail verifies second reply also stays in the SAME thread.
```

---

## 8. Production Rollout Strategy

1. **Local Pre-Flight**: Run full automated test suite, linter, and typechecker (`npm run lint && npm run build && npm test`).
2. **Additive Migration Safety**: Run `npx prisma migrate deploy` in staging/production. Because all new columns are nullable, this operation is instantaneous and non-locking.
3. **Deploy Backend**: Deploy updated backend to Render. Verify `GET /api/v1/health` reports status `ok` and `resend: CONFIGURED`.
4. **Deploy Frontend**: Deploy frontend to Vercel.
5. **Production Smoke Test**: Execute the Canonical Real-World Threading Verification (Section 7.2).
6. **Zero Disruption Guarantee**: Google Workspace MX routing and existing Resend inbound addresses must not experience downtime.
7. **Rollback Threshold**: If outbound replies fail or webhook errors spike (>0.1%), immediately roll back backend deployment to previous stable commit.

---

## 9. Phase Completion Rules

A phase is officially **`[COMPLETE]`** only when:
1. All deliverables defined in the phase scope are implemented.
2. `npm run lint` passes with zero errors.
3. `npm run build` succeeds without type errors.
4. All unit, integration, and concurrency tests for that phase pass.
5. The phase's specified validation gate has been manually or automatically verified.
6. The security invariants for that phase are verified.
7. `docs/EMAIL_REMEDIATION_ROADMAP.md` is updated with verification evidence and status changed to `[COMPLETE]`.
8. The git working tree is clean with an atomic, conventional commit.

> [!CAUTION]
> **No Self-Proclaimed Completion:** A phase must never be marked complete based on code editing output alone. Every phase must pass its explicit validation gates.

---

## 10. Final Recommended Execution Order

| Execution Order | Phase | Primary Benefit | Risk Level |
| :---: | :--- | :--- | :---: |
| **1** | **Phase 1: Email Reply Threading & Metadata** | Fixes fragmented customer email threads | Low (Additive) |
| **2** | **Phase 2: Webhook Idempotency & Concurrency** | Stops HTTP 500s on duplicate deliveries | Low (Resilience) |
| **3** | **Phase 3: Sender Metadata & Safe Storage** | Preserves sender names; caps body at 250KB | Low (Additive) |
| **4** | **Phase 4: Conversation Uniqueness** | Prevents duplicate threads in CRM | Low (After audit) |
| **5** | **Phase 5: Inbox Query Performance & Unread** | Eliminates unread query full-table scan | Low (Index-only) |
| **6** | **Phase 6: Resend API Resilience** | Prevents transient 429/5xx message loss | Low (Adapter-only) |
| **7** | **Phase 7: Safe URL Linkification** | Clickable links in inbox without XSS | Low (Frontend-only) |
| **8** | **Phase 8: Inbox Freshness & Polling** | 15s auto-refresh for incoming emails | Low (Frontend-only) |

---
*Roadmap established. Proceed sequentially starting with Phase 1 upon approval.*
