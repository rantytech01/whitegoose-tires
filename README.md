# WhiteGoose Tires Limited — Platform Monorepo

Scaffold for the tire e-commerce, inventory, sales, and CRM platform described
in the master brief. This is a starting structure, not a finished build —
every service stub has `TODO` markers pointing at what to wire up next.

## What is here

```
whitegoose-tires/
├── backend/     NestJS API (auth, products, inventory, orders, payments, customers, crm, branches, reports)
├── frontend/    Next.js 15 storefront + admin dashboard
├── docs/        Database schema + full API contract (docs/database-and-api-design.md)
├── docker-compose.yml   Postgres + Redis + backend + frontend, for local dev
└── .github/workflows/ci.yml   Build + test on every PR
```

A companion interactive prototype (storefront + admin, no backend needed)
is available as a Claude artifact — use it as the visual/interaction reference
while wiring up the real pages in `frontend/app`.

## Getting started

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# fill in DATABASE_URL, JWT secrets, M-Pesa Daraja credentials, etc.

# 3. Run Postgres + Redis (or point at your own instances)
docker compose up postgres redis -d

# 4. Run the apps
cd backend && npm run start:dev     # http://localhost:4000/api/v1
cd frontend && npm run dev          # http://localhost:3000
```

## Testing

```bash
cd backend
npm test                # unit tests (phone/money/order-status/M-Pesa parsing)
npm run typecheck

# End-to-end checkout smoke test: needs a migrated Postgres. It boots the API
# in-process and uses a fake Daraja server, so no Safaricom credentials are needed.
DATABASE_URL=postgres://whitegoose:whitegoose@localhost:5432/whitegoose npm run migration:run
npm run build && DATABASE_URL=... npm run smoke
```

## Build order

Follow section 5 ("Suggested Build Order") in `docs/database-and-api-design.md`:

1. Auth + Products (read-only) → storefront browsing works — **done**
2. Cart + Orders + Payments (M-Pesa first) → checkout works end-to-end — **backend done** (frontend wiring pending; card processor pending)
3. Inventory + Branches → stock accuracy, multi-branch — **minimum done** (branches CRUD, stock adjust/list, reservation/release); suppliers, purchase orders, transfers pending
4. Admin dashboard aggregate queries → reporting
5. CRM + Support tickets

## Not included yet (by design — this is a starting scaffold)

- Actual TypeORM entities for every table in the schema (only `Product` is stubbed as an example)
- Elasticsearch, GraphQL, and WebSocket wiring (planned in the brief; add once Postgres full-text search outgrows itself — see "Key Design Decisions" in the schema doc)
- Kubernetes manifests (docker-compose is enough for local/staging; add k8s manifests once you pick a cloud target)
- Test suites beyond the CI skeleton
- Cookie consent banner, legal pages, SEO metadata generation, PWA manifest
