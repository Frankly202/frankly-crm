# FranklyEdu Global CRM — Frontend API Contract & Integration Guide

**Version**: 0.1.0  
**Target Environment**: Local MVP Backend (`http://localhost:4000/api/v1`)  
**Specification Reference**: [`docs/api-spec.yaml`](./api-spec.yaml)  
**Primary Consumers**: Lovable UI, Next.js / React Frontend, TanStack Query

---

## Table of Contents
1. [Architectural Overview & Global Envelopes](#1-architectural-overview--global-envelopes)
2. [Authentication & Token Lifecycle](#2-authentication--token-lifecycle)
3. [Role-Based Access Control (RBAC)](#3-role-based-access-control-rbac)
4. [Domain Enums & Taxonomy](#4-domain-enums--taxonomy)
5. [Error Handling & Taxonomy](#5-error-handling--taxonomy)
6. [Complete API Catalog](#6-complete-api-catalog)
   - [6.1 System Health](#61-system-health)
   - [6.2 Authentication](#62-authentication)
   - [6.3 Contacts](#63-contacts)
   - [6.4 Dashboard Metrics](#64-dashboard-metrics)
   - [6.5 Leads & Activities](#65-leads--activities)
   - [6.6 Unified Inbox & Conversations](#66-unified-inbox--conversations)
   - [6.7 Inbound Webhooks](#67-inbound-webhooks)
7. [Frontend Integration Patterns (TanStack Query / Next.js)](#7-frontend-integration-patterns-tanstack-query--nextjs)

---

## 1. Architectural Overview & Global Envelopes

The Frankly CRM backend is a RESTful JSON API following strict request and response contracts. All domain endpoints are mounted under the `/api/v1` namespace.

### Base URL
- **Local Development**: `http://localhost:4000/api/v1`
- **CORS**: Credentials are enabled (`credentials: true`). Origin is configurable via `CORS_ORIGIN` (defaults to `http://localhost:3000,http://localhost:8080`).

### Standard Success Envelope
Every successful response returns an HTTP 2xx status code and the following envelope:

```typescript
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Standard Error Envelope
Every non-2xx response returns an operational error envelope:

```typescript
export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;       // Machine-readable uppercase code (e.g. VALIDATION_ERROR)
    message: string;    // Human-readable summary description
    details?: unknown;  // Optional validation breakdown (e.g. Zod field errors)
  };
}
```

---

## 2. Authentication & Token Lifecycle

Authentication uses a hybrid dual-token architecture:
- **Access Token**: Stateless JWT signed with `JWT_ACCESS_SECRET`.
  - **Lifespan**: **15 minutes**.
  - **Payload**: `{ userId: string, email: string, role: 'ADMIN' | 'AGENT' }`.
  - **Header Format**: `Authorization: Bearer <accessToken>`.
- **Refresh Token**: Cryptographically secure 256-bit random string (opaque to the frontend).
  - **Lifespan**: **7 days**.
  - **Storage**: The SHA-256 hash is stored statefully in the database.
  - **Rotation**: Refresh tokens are **single-use**. Calling `POST /api/v1/auth/refresh` revokes the submitted token and issues a brand-new access/refresh token pair.
  - **Reuse & Concurrency Protection**: Atomic DB transactions ensure that if two concurrent requests attempt to rotate the same token, only one succeeds. If a previously revoked token is presented, the server detects potential token reuse and immediately revokes **all** active sessions for that user.

### Frontend Token Handling Recommendations
1. Store the `accessToken` in memory or in an `authContext` state.
2. Store the `refreshToken` in a secure HTTP-only cookie or secure storage.
3. Configure an Axios/Fetch interceptor:
   - When a request returns `401 UNAUTHORIZED`, queue pending requests, call `POST /api/v1/auth/refresh`, update the access token, and replay the queued requests.
   - If the refresh call fails, clear user state and redirect to `/login`.

---

## 3. Role-Based Access Control (RBAC)

The CRM defines two user roles:
- **`ADMIN`**:
  - Full access to all CRM contacts, leads, conversations, messages, and metrics.
  - Can create new agents or admins via `POST /api/v1/auth/register`.
- **`AGENT`**:
  - Full access to CRM operational entities: contacts, leads, activities, conversations, and messaging.
  - Cannot access `/api/v1/auth/register` (returns `403 FORBIDDEN`).

---

## 4. Domain Enums & Taxonomy

All enums must match these exact string values:

### `Role`
| Value | Description |
| :--- | :--- |
| `ADMIN` | Administrator with user management permissions |
| `AGENT` | CRM Agent handling leads, contacts, and inbox conversations |

### `LeadCategory` (Frankly's 5 Core Business Categories)
| Value | Display Label | Description |
| :--- | :--- | :--- |
| `PROPERTY_BUYER_INVESTOR` | Property Buyer / Investor | Clients inquiring about acquiring Cyprus real estate or investment opportunities |
| `PROPERTY_SELLER_AGENT` | Property Seller / Agent | Property developers, owners, or local agents seeking brokerage or listing |
| `STUDY_ABROAD_STUDENT` | Study Abroad Student | International students seeking university admissions and visa guidance in Cyprus |
| `UNIVERSITY_EDUCATION_PARTNER` | Education Partner | Universities, academic institutions, or education agents seeking partnership |
| `OTHER_BUSINESS` | Other Business | General inquiries, legal, banking, immigration, or miscellaneous corporate leads |

### `LeadStatus` (Lifecycle Stages)
| Value | Display Label | Behavior & Transition Rules |
| :--- | :--- | :--- |
| `NEW` | New | Initial status upon submission or creation. No outbound contact has occurred yet. |
| `CONTACTED` | Contacted | Set when an agent has initiated communication with the lead. |
| `REPLIED` | Replied | Automatically set when an inbound message arrives from a contact with a `CONTACTED` lead. |
| `QUALIFIED` | Qualified | Manually set when the lead's budget, readiness, or eligibility has been verified. |
| `LOST` | Lost | The lead is unqualified, non-responsive, or no longer interested. |
| `CLOSED_WON` | Closed / Won | Successfully concluded transaction (property purchase, university enrollment, contract signed). |

### `ChannelType`
| Value | Display Label | Integration Details |
| :--- | :--- | :--- |
| `WHATSAPP` | WhatsApp Business | Meta Cloud API format fixture |
| `INSTAGRAM` | Instagram Direct | Meta Graph API format fixture |
| `RESEND_EMAIL` | Email | Resend inbound webhook format fixture |
| `WEBSITE_FORM` | Website Form | Public website contact/enquiry portal submission |

### `ActivityType`
| Value | Display Label | Logged Context |
| :--- | :--- | :--- |
| `LEAD_CREATED` | Lead Created | Automatically recorded upon lead creation |
| `STATUS_CHANGED` | Status Changed | Automatically recorded on status transitions |
| `LEAD_ASSIGNED` | Lead Assigned | Automatically recorded when lead is assigned or unassigned |
| `MESSAGE_SENT` | Message Sent | Automatically recorded when an outbound reply is dispatched |
| `MESSAGE_RECEIVED` | Message Received | Automatically recorded when an inbound customer message is ingested |
| `NOTE_ADDED` | Note Added | Agent-created internal note or communication summary |
| `NEXT_ACTION_SET` | Next Action Set | Automatically recorded when next action or due date is updated |

### `MessageDirection`
- `INBOUND`: Received from customer.
- `OUTBOUND`: Sent by agent/system.

### `MessageStatus`
- `RECEIVED`: Inbound message persisted.
- `SENT`: Outbound message sent.
- `DELIVERED`: Confirmed delivered by provider.
- `FAILED`: Transmission failed.

---

## 5. Error Handling & Taxonomy

When an error occurs, the server responds with a structured `ApiErrorEnvelope`:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "body": {
        "email": ["Valid email address is required"]
      }
    }
  }
}
```

### Standard Error Codes & Status Codes
| HTTP Status | Code | Description | Typical Cause |
| :---: | :--- | :--- | :--- |
| `400` | `BAD_REQUEST` | Malformed request parameters | Missing required parameters or invalid syntax |
| `401` | `UNAUTHORIZED` | Missing or invalid auth credentials | Access token missing, expired, or invalid |
| `403` | `FORBIDDEN` | Access denied | Agent trying to call admin-restricted endpoints |
| `404` | `NOT_FOUND` | Resource not found | Invalid UUID or entity does not exist |
| `409` | `CONFLICT` | Resource collision | Unique constraint violation (email, phone, IG handle) |
| `422` | `VALIDATION_ERROR` | Schema validation error | Zod request validation failure on body, query, or params |
| `429` | `TOO_MANY_REQUESTS` | Rate limit exceeded | Excessive login attempts or website form spam |
| `500` | `INTERNAL_ERROR` | Internal server exception | Unhandled server error |

---

## 6. Complete API Catalog

### 6.1 System Health

#### `GET /health`
- **Auth**: None (Public)
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-09-07T14:30:00.000Z",
    "uptimeSeconds": 3600,
    "environment": "development"
  }
}
```

---

### 6.2 Authentication

#### `POST /auth/login`
- **Auth**: None (Public, Rate-limited: 5 attempts / 15m)
- **Request Body**:
```json
{
  "email": "emmanuel@frankedu-global.com",
  "password": "<ADMIN_PASSWORD>"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
      "email": "emmanuel@frankedu-global.com",
      "name": "Frankly Emmanuel",
      "role": "ADMIN"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "refreshToken": "5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e"
  }
}
```

#### `POST /auth/register`
- **Auth**: Bearer JWT (Restricted to **`ADMIN`** only)
- **Request Body**:
```json
{
  "email": "agent.smith@frankedu-global.com",
  "password": "SecurePassword123!",
  "name": "Agent Smith",
  "role": "AGENT"
}
```
- **Response**: `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "8f3e2d1c-0b9a-4c8d-7e6f-5a4b3c2d1e0f",
    "email": "agent.smith@frankedu-global.com",
    "name": "Agent Smith",
    "role": "AGENT"
  }
}
```

#### `POST /auth/refresh`
- **Auth**: None (Public)
- **Request Body**:
```json
{
  "refreshToken": "5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
    "refreshToken": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
  }
}
```

#### `POST /auth/logout`
- **Auth**: None (Public)
- **Request Body**:
```json
{
  "refreshToken": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
}
```
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

#### `GET /auth/me`
- **Auth**: Bearer JWT
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
    "email": "emmanuel@frankedu-global.com",
    "name": "Frankly Emmanuel",
    "role": "ADMIN"
  }
}
```

---

### 6.3 Contacts

#### `GET /contacts`
- **Auth**: Bearer JWT
- **Query Parameters**:
  - `page` (optional integer, default `1`)
  - `limit` (optional integer, default `20`, max `100`)
  - `search` (optional string, matches name, email, phone, or Instagram handle)
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
      "name": "Alex Michaelides",
      "primaryEmail": "alex@example.com",
      "primaryPhone": "+35799123456",
      "instagramHandle": "alex_cyprus",
      "metadata": { "country": "Cyprus" },
      "createdAt": "2026-09-07T12:00:00.000Z",
      "updatedAt": "2026-09-07T12:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

#### `POST /contacts`
- **Auth**: Bearer JWT
- **Request Body**:
```json
{
  "name": "Alex Michaelides",
  "primaryEmail": "alex@example.com",
  "primaryPhone": "+35799123456",
  "instagramHandle": "alex_cyprus",
  "metadata": { "city": "Limassol" }
}
```
- **Validation**: At least one identifier (`primaryEmail`, `primaryPhone`, or `instagramHandle`) must be provided.
- **Response**: `201 Created`

#### `GET /contacts/:id`
- **Auth**: Bearer JWT
- **Response**: `200 OK` (includes linked `leads` and `conversations`)
```json
{
  "success": true,
  "data": {
    "id": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
    "name": "Alex Michaelides",
    "primaryEmail": "alex@example.com",
    "primaryPhone": "+35799123456",
    "instagramHandle": "alex_cyprus",
    "metadata": { "city": "Limassol" },
    "createdAt": "2026-09-07T12:00:00.000Z",
    "updatedAt": "2026-09-07T12:00:00.000Z",
    "leads": [
      {
        "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
        "title": "Limassol Seafront Villa Enquiry",
        "category": "PROPERTY_BUYER_INVESTOR",
        "status": "NEW",
        "sourceChannel": "WEBSITE_FORM",
        "assignedTo": {
          "id": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
          "name": "Frankly Emmanuel",
          "email": "emmanuel@frankedu-global.com",
          "role": "ADMIN"
        }
      }
    ],
    "conversations": [
      {
        "id": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
        "channel": "WHATSAPP",
        "channelThreadId": "+35799123456",
        "lastMessageAt": "2026-09-07T13:00:00.000Z",
        "createdAt": "2026-09-07T12:00:00.000Z"
      }
    ]
  }
}
```

#### `PATCH /contacts/:id`
- **Auth**: Bearer JWT
- **Request Body**: (all fields optional)
```json
{
  "name": "Alex Michaelides Updated",
  "primaryPhone": "+35799988776"
}
```
- **Response**: `200 OK`

---

### 6.4 Dashboard Metrics

#### `GET /leads/dashboard/metrics`
- **Auth**: Bearer JWT
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "totals": {
      "totalLeads": 42,
      "totalContacts": 38
    },
    "byStatus": {
      "NEW": 10,
      "CONTACTED": 8,
      "REPLIED": 7,
      "QUALIFIED": 11,
      "LOST": 4,
      "CLOSED_WON": 2
    },
    "byCategory": {
      "PROPERTY_BUYER_INVESTOR": 15,
      "PROPERTY_SELLER_AGENT": 6,
      "STUDY_ABROAD_STUDENT": 12,
      "UNIVERSITY_EDUCATION_PARTNER": 5,
      "OTHER_BUSINESS": 4
    },
    "nextActions": {
      "totalPending": 14,
      "overdue": 3,
      "dueToday": 2,
      "upcoming": 6,
      "noDueDate": 3
    },
    "recentActivity": {
      "leadsCreatedToday": 4,
      "leadsCreatedThisWeek": 18
    }
  }
}
```

---

### 6.5 Leads & Activities

#### `GET /leads`
- **Auth**: Bearer JWT
- **Query Parameters**:
  - `page` (integer, default `1`)
  - `limit` (integer, default `20`, max `100`)
  - `category` (`LeadCategory` enum)
  - `status` (`LeadStatus` enum)
  - `assignedToUserId` (user UUID string)
  - `sourceChannel` (`ChannelType` enum)
  - `search` (text matching title, notes, next action, contact name, contact email)
  - `hasPendingNextAction` (`true` | `false`)
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "title": "Limassol Seafront Villa Enquiry",
      "category": "PROPERTY_BUYER_INVESTOR",
      "status": "NEW",
      "sourceChannel": "WEBSITE_FORM",
      "contactId": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
      "assignedToUserId": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
      "notes": "Budget €1.5M - €2.0M",
      "nextActionRequired": "Schedule property viewing",
      "nextActionDueDate": "2026-09-10T10:00:00.000Z",
      "createdAt": "2026-09-07T12:00:00.000Z",
      "updatedAt": "2026-09-07T12:00:00.000Z",
      "contact": {
        "id": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        "name": "Alex Michaelides",
        "primaryEmail": "alex@example.com",
        "primaryPhone": "+35799123456",
        "instagramHandle": "alex_cyprus"
      },
      "assignedTo": {
        "id": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
        "name": "Frankly Emmanuel",
        "email": "emmanuel@frankedu-global.com",
        "role": "ADMIN"
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

#### `POST /leads`
- **Auth**: Bearer JWT
- **Request Body**:
```json
{
  "title": "Limassol Seafront Villa Enquiry",
  "category": "PROPERTY_BUYER_INVESTOR",
  "contactId": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
  "status": "NEW",
  "assignedToUserId": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
  "sourceChannel": "WEBSITE_FORM",
  "notes": "Interested in Cyprus Golden Visa through real estate purchase",
  "nextActionRequired": "Send property brochures",
  "nextActionDueDate": "2026-09-09T14:00:00.000Z"
}
```
- **Response**: `201 Created`

#### `GET /leads/:id`
- **Auth**: Bearer JWT
- **Response**: `200 OK` (includes `contact`, `assignedTo`, `conversations`, and `activities`)

#### `PATCH /leads/:id`
- **Auth**: Bearer JWT
- **Request Body**: (all fields optional)
```json
{
  "title": "Updated Title",
  "notes": "Client requested secondary options in Larnaca",
  "nextActionRequired": "Prepare Larnaca listings",
  "nextActionDueDate": "2026-09-11T12:00:00.000Z"
}
```
- **Response**: `200 OK`

#### `PATCH /leads/:id/status`
- **Auth**: Bearer JWT
- **Request Body**:
```json
{
  "status": "QUALIFIED",
  "note": "Client confirmed budget and flight dates to Cyprus"
}
```
- **Response**: `200 OK`

#### `PATCH /leads/:id/assign`
- **Auth**: Bearer JWT
- **Request Body**:
```json
{
  "assignedToUserId": "8f3e2d1c-0b9a-4c8d-7e6f-5a4b3c2d1e0f"
}
```
- **Note**: Pass `null` to unassign the lead.
- **Response**: `200 OK`

#### `GET /leads/:id/activities`
- **Auth**: Bearer JWT
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d",
      "leadId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "userId": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
      "type": "STATUS_CHANGED",
      "description": "Status changed from CONTACTED to QUALIFIED",
      "metadata": {
        "previousStatus": "CONTACTED",
        "newStatus": "QUALIFIED",
        "note": "Client confirmed budget and flight dates to Cyprus"
      },
      "createdAt": "2026-09-07T14:00:00.000Z",
      "user": {
        "id": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d",
        "name": "Frankly Emmanuel",
        "email": "emmanuel@frankedu-global.com"
      }
    }
  ]
}
```

#### `POST /leads/:id/activities`
- **Auth**: Bearer JWT
- **Request Body**:
```json
{
  "type": "NOTE_ADDED",
  "description": "Client requested consultation with our in-house immigration lawyer.",
  "metadata": { "followUpNeeded": true }
}
```
- **Response**: `201 Created`

---

### 6.6 Unified Inbox & Conversations

#### `GET /conversations`
- **Auth**: Bearer JWT
- **Query Parameters**:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `channel` (`WHATSAPP` | `INSTAGRAM` | `RESEND_EMAIL` | `WEBSITE_FORM`)
  - `contactId` (UUID string)
  - `leadId` (UUID string)
  - `unreadOnly` (`true` | `false`)
  - `search` (searches contact name, email, phone, IG, thread ID, or message text)
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "contactId": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
      "leadId": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
      "channel": "WHATSAPP",
      "channelThreadId": "+35799123456",
      "lastMessageAt": "2026-09-07T14:20:00.000Z",
      "lastReadAt": "2026-09-07T14:15:00.000Z",
      "isUnread": true,
      "contact": {
        "id": "7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
        "name": "Alex Michaelides",
        "primaryEmail": "alex@example.com",
        "primaryPhone": "+35799123456",
        "instagramHandle": "alex_cyprus"
      },
      "lead": {
        "id": "4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d",
        "title": "Limassol Seafront Villa Enquiry",
        "category": "PROPERTY_BUYER_INVESTOR",
        "status": "REPLIED",
        "assignedToUserId": "3c9b1d8e-7e2a-4b9f-8c1d-0e1f2a3b4c5d"
      },
      "latestMessage": {
        "id": "8e9f0a1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b",
        "direction": "INBOUND",
        "status": "RECEIVED",
        "body": "Can you share the price list for the penthouse units?",
        "createdAt": "2026-09-07T14:20:00.000Z"
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

#### `GET /conversations/:id`
- **Auth**: Bearer JWT
- **Response**: `200 OK` (returns conversation, linked contact, linked lead, messages array sorted chronologically ascending, and computed `isUnread`)

#### `POST /conversations/:id/messages` (Send Reply)
- **Auth**: Bearer JWT
- **Request Body**:
```json
{
  "body": "Hi Alex, here is the updated brochure for the Paphos beachfront development."
}
```
- **Side Effects**:
  - Outbound message sent through the conversation's channel adapter simulator.
  - New `Message` record saved (`direction: OUTBOUND`, `status: SENT`).
  - Conversation `lastMessageAt` updated and `lastReadAt` set to current time.
  - `ActivityLog` recorded for `MESSAGE_SENT`.
- **Response**: `200 OK`

#### `PATCH /conversations/:id/read`
- **Auth**: Bearer JWT
- **Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "lastReadAt": "2026-09-07T14:35:00.000Z",
    "isUnread": false
  }
}
```

---

### 6.7 Inbound Webhooks

The backend implements unified inbound ingestion routes for all 4 channels:

| Method | Path | Protocol / Verification | Purpose |
| :---: | :--- | :--- | :--- |
| `GET` | `/webhooks/whatsapp` | Meta Hub Challenge (`hub.verify_token`, `hub.challenge`) | Webhook setup handshake |
| `POST` | `/webhooks/whatsapp` | `X-Hub-Signature-256` HMAC-SHA256 | Ingest WhatsApp messages |
| `GET` | `/webhooks/instagram` | Meta Hub Challenge (`hub.verify_token`, `hub.challenge`) | Webhook setup handshake |
| `POST` | `/webhooks/instagram` | `X-Hub-Signature-256` HMAC-SHA256 | Ingest Instagram DMs |
| `POST` | `/webhooks/resend` | Svix Signatures (`svix-signature`) | Ingest inbound emails |
| `POST` | `/webhooks/website` | Public CORS + Honeypot + Rate Limiting | Ingest website enquiry forms |

#### Website Form Ingestion Payload
```json
{
  "name": "Elena Constantinou",
  "email": "elena@example.com",
  "phone": "+35799778899",
  "category": "PROPERTY_BUYER_INVESTOR",
  "message": "Looking for a 3-bedroom villa in Paphos near the sea.",
  "submissionId": "web_sub_998877",
  "_hp_company": ""
}
```
*Note: `_hp_company` is a honeypot field. If non-empty, the request is treated as bot spam and silently dropped.*

---

## 7. Frontend Integration Patterns (TanStack Query / Next.js)

### Recommended Query Keys
```typescript
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  contacts: {
    all: ['contacts'] as const,
    list: (params: Record<string, unknown>) => ['contacts', 'list', params] as const,
    detail: (id: string) => ['contacts', 'detail', id] as const,
  },
  leads: {
    all: ['leads'] as const,
    list: (params: Record<string, unknown>) => ['leads', 'list', params] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
    activities: (id: string) => ['leads', 'activities', id] as const,
  },
  metrics: {
    dashboard: ['metrics', 'dashboard'] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    list: (params: Record<string, unknown>) => ['conversations', 'list', params] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
  },
};
```

### Mutation Invalidation Guidelines
1. **After creating or updating a lead**:
   - Invalidate `queryKeys.leads.all`
   - Invalidate `queryKeys.metrics.dashboard`
   - Invalidate `queryKeys.contacts.detail(contactId)`
2. **After sending a message in a conversation**:
   - Invalidate `queryKeys.conversations.detail(conversationId)`
   - Invalidate `queryKeys.conversations.all`
3. **After marking a conversation as read**:
   - Optimistically set `isUnread: false` on the active conversation item.
   - Invalidate `queryKeys.conversations.all` to refresh unread badge counts in the sidebar.
