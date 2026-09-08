# FranklyEdu Global CRM — Frontend Application

Modern React & TanStack Start frontend for FranklyEdu Global Internal CRM MVP.

## Technology Stack

- **Framework**: [TanStack Start](https://tanstack.com/start/latest) (React 19 + Vite)
- **Routing**: [TanStack Router](https://tanstack.com/router/latest) (file-based routing in `src/routes/`)
- **State & Data Fetching**: [TanStack Query v5](https://tanstack.com/query/latest)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com) + Radix UI primitives
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 20+
- Running Frankly CRM backend on `http://localhost:4000` (see `backend/.env.example`)

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

The application will start at `http://localhost:8080`.

### Production Build

```bash
npm run build
npm run preview
```

## Application Structure

```
frontend/
├── public/              # Static assets & favicons
├── src/
│   ├── components/      # UI components (Radix primitives, layout, CRM badges)
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # API client, auth context, formatters, utilities
│   │   ├── api/         # Typed API queries & client matching docs/API_CONTRACT.md
│   │   └── auth.tsx     # Session management & token storage
│   ├── routes/          # TanStack Start file-based pages
│   │   ├── __root.tsx   # Root application layout & providers
│   │   ├── login.tsx    # Agent/Admin sign-in page
│   │   ├── dashboard.tsx# Real-time metrics & pipeline overview
│   │   ├── leads.tsx    # Multi-sector lead directory
│   │   ├── leads.$leadId.tsx # Lead detail & activity timeline
│   │   └── contacts.tsx # Contact directory
│   ├── routeTree.gen.ts # Auto-generated TanStack Router tree
│   └── styles.css       # Design tokens & Tailwind theme
├── package.json
├── tsconfig.json
└── vite.config.ts
```
