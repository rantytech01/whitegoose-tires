# WhiteGoose Tires Limited — Database Schema & API Design

Companion to the storefront/admin prototype. This document defines the core PostgreSQL schema and the REST API surface for the NestJS backend. It covers the customer, inventory, sales, and CRM domains described in the master brief, scoped to what a first production release needs — later phases (multi-currency, marketplace sellers, mobile push) can extend it without breaking these tables.

---

## 1. Schema Overview

Ten domains, each owning its own tables:

1. **Identity & Access** — users, roles, permissions, refresh tokens
2. **Catalog** — products, tire specs, categories, brands
3. **Inventory** — stock levels per branch, stock movements, suppliers, purchase orders
4. **Customers** — customer profiles, vehicles, addresses, wishlists
5. **Sales** — carts, orders, order items, payments, invoices
6. **CRM** — leads, follow-ups, support tickets
7. **Branches** — branch directory, branch staff assignments
8. **Reporting** — materialized/aggregate tables for dashboard speed
9. **Audit & Security** — audit logs, login attempts
10. **Content** — reviews, promotions/coupons

---

## 2. Core Tables

### 2.1 Identity & Access

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             VARCHAR(255) UNIQUE NOT NULL,
  phone             VARCHAR(20) UNIQUE,
  password_hash     VARCHAR(255),            -- null if OAuth-only
  full_name         VARCHAR(150) NOT NULL,
  user_type         VARCHAR(20) NOT NULL,    -- 'customer' | 'staff' | 'admin'
  mfa_enabled       BOOLEAN DEFAULT FALSE,
  mfa_secret        VARCHAR(255),
  email_verified_at TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE roles (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(50) UNIQUE NOT NULL   -- 'super_admin','branch_manager','sales_staff','inventory_clerk','customer'
);

CREATE TABLE permissions (
  id    SERIAL PRIMARY KEY,
  code  VARCHAR(80) UNIQUE NOT NULL   -- 'products.write','orders.refund','reports.view', etc.
);

CREATE TABLE role_permissions (
  role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 Catalog

```sql
CREATE TABLE brands (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(80) UNIQUE NOT NULL,
  logo_url VARCHAR(255)
);

CREATE TABLE categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(50) NOT NULL,        -- 'Tires','Rims','Accessories'
  slug  VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku           VARCHAR(40) UNIQUE NOT NULL,
  category_id   INT REFERENCES categories(id),
  brand_id      INT REFERENCES brands(id),
  name          VARCHAR(150) NOT NULL,
  condition     VARCHAR(10) NOT NULL,     -- 'new' | 'used'
  description   TEXT,
  price         NUMERIC(12,2) NOT NULL,
  discount_pct  NUMERIC(5,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Tire-specific attributes live in their own table so rims/accessories
-- don't carry irrelevant columns.
CREATE TABLE tire_specs (
  product_id      UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  width_mm        SMALLINT NOT NULL,     -- 205
  aspect_ratio    SMALLINT NOT NULL,     -- 55
  rim_diameter_in SMALLINT NOT NULL,     -- 16
  load_index      SMALLINT,
  speed_rating     VARCHAR(3),
  tread_condition_pct SMALLINT,          -- used tires only, e.g. 70
  season          VARCHAR(12)            -- 'all_season','summer','winter'
);

CREATE TABLE product_images (
  id          SERIAL PRIMARY KEY,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  url         VARCHAR(255) NOT NULL,
  sort_order  SMALLINT DEFAULT 0
);

CREATE TABLE vehicle_fitments (       -- for "search by vehicle model" lookups
  id            SERIAL PRIMARY KEY,
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  make          VARCHAR(50),
  model         VARCHAR(50),
  year_from     SMALLINT,
  year_to       SMALLINT
);

CREATE INDEX idx_products_search ON products USING GIN (to_tsvector('english', name));
CREATE INDEX idx_tire_specs_size ON tire_specs (width_mm, aspect_ratio, rim_diameter_in);
```

### 2.3 Branches & Inventory

```sql
CREATE TABLE branches (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(80) NOT NULL,
  address   VARCHAR(255),
  city      VARCHAR(60),
  phone     VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE staff_assignments (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id  INT REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE inventory (
  id           BIGSERIAL PRIMARY KEY,
  product_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  branch_id    INT REFERENCES branches(id) ON DELETE CASCADE,
  quantity     INT NOT NULL DEFAULT 0,
  reorder_level INT DEFAULT 5,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, branch_id)
);

CREATE TABLE stock_movements (        -- append-only ledger; inventory.quantity is derived/cached
  id            BIGSERIAL PRIMARY KEY,
  product_id    UUID REFERENCES products(id),
  branch_id     INT REFERENCES branches(id),
  change_qty    INT NOT NULL,          -- positive = stock in, negative = stock out
  reason        VARCHAR(30) NOT NULL,  -- 'purchase','sale','adjustment','transfer','return'
  reference_id  UUID,                  -- order_id or purchase_order_id
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE suppliers (
  id      SERIAL PRIMARY KEY,
  name    VARCHAR(120) NOT NULL,
  phone   VARCHAR(20),
  email   VARCHAR(255)
);

CREATE TABLE purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   INT REFERENCES suppliers(id),
  branch_id     INT REFERENCES branches(id),
  status        VARCHAR(20) DEFAULT 'pending',  -- pending, received, cancelled
  total_amount  NUMERIC(14,2),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id                 BIGSERIAL PRIMARY KEY,
  purchase_order_id  UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id         UUID REFERENCES products(id),
  quantity            INT NOT NULL,
  unit_cost          NUMERIC(12,2) NOT NULL
);
```

### 2.4 Customers

```sql
CREATE TABLE customer_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  loyalty_points INT DEFAULT 0,
  preferred_branch_id INT REFERENCES branches(id)
);

CREATE TABLE customer_vehicles (
  id           SERIAL PRIMARY KEY,
  customer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  make         VARCHAR(50),
  model        VARCHAR(50),
  year         SMALLINT,
  plate_number VARCHAR(20)
);

CREATE TABLE addresses (
  id           SERIAL PRIMARY KEY,
  customer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  label        VARCHAR(40),           -- 'Home','Office'
  line1        VARCHAR(150),
  city         VARCHAR(60),
  is_default   BOOLEAN DEFAULT FALSE
);

CREATE TABLE wishlists (
  customer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);
```

### 2.5 Sales

```sql
CREATE TABLE carts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID REFERENCES users(id),   -- null for guest carts (session-based)
  session_id   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cart_items (
  cart_id      UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id),
  quantity     INT NOT NULL,
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number   VARCHAR(20) UNIQUE NOT NULL,   -- 'WG12345'
  customer_id    UUID REFERENCES users(id),
  branch_id      INT REFERENCES branches(id),
  status         VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, packed, dispatched, delivered, cancelled
  subtotal       NUMERIC(14,2) NOT NULL,
  delivery_fee   NUMERIC(10,2) DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL,
  delivery_address_id INT REFERENCES addresses(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),
  quantity    INT NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL          -- snapshot at time of sale
);

CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  method       VARCHAR(20) NOT NULL,   -- 'mpesa','card','bank_transfer','cod'
  amount       NUMERIC(14,2) NOT NULL,
  status       VARCHAR(20) DEFAULT 'pending',  -- pending, completed, failed, refunded
  provider_ref VARCHAR(100),           -- M-Pesa receipt / Stripe charge id
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID REFERENCES orders(id),
  pdf_url    VARCHAR(255),
  issued_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status_created ON orders(status, created_at);
```

### 2.6 CRM & Support

```sql
CREATE TABLE leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(150),
  phone         VARCHAR(20),
  source        VARCHAR(30),        -- 'website','walk_in','referral','ad'
  status        VARCHAR(20) DEFAULT 'new',  -- new, contacted, qualified, won, lost
  assigned_to   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lead_followups (
  id         SERIAL PRIMARY KEY,
  lead_id    UUID REFERENCES leads(id) ON DELETE CASCADE,
  note       TEXT,
  due_at     TIMESTAMPTZ,
  done_at    TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

CREATE TABLE support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID REFERENCES users(id),
  subject      VARCHAR(150),
  status       VARCHAR(20) DEFAULT 'open',  -- open, in_progress, resolved, closed
  channel      VARCHAR(20),                 -- 'chat','whatsapp','email','phone'
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### 2.7 Audit & Content

```sql
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(80) NOT NULL,   -- 'order.refund','product.price_change'
  entity_type VARCHAR(40),
  entity_id   VARCHAR(60),
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reviews (
  id          SERIAL PRIMARY KEY,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES users(id),
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE coupons (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(30) UNIQUE NOT NULL,
  discount_pct  NUMERIC(5,2),
  valid_from    TIMESTAMPTZ,
  valid_to      TIMESTAMPTZ,
  max_uses      INT
);
```

---

## 3. API Design (REST, versioned under `/api/v1`)

Conventions: JWT bearer auth (`Authorization: Bearer <token>`) with a 15-minute access token + rotating refresh token; RBAC guards on staff/admin routes via `@Roles()` decorator; all list endpoints paginate with `?page=&limit=` and return `{ data, meta: { page, limit, total } }`; all mutations are audit-logged.

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Email/phone + password, sends OTP |
| POST | `/auth/verify-otp` | Confirms phone/email |
| POST | `/auth/login` | Returns access + refresh token |
| POST | `/auth/google` | OAuth login |
| POST | `/auth/refresh` | Rotates refresh token |
| POST | `/auth/forgot-password` / `/auth/reset-password` | |
| POST | `/auth/mfa/enable` / `/auth/mfa/verify` | |

### Catalog (public read, admin write)
| Method | Path | Notes |
|---|---|---|
| GET | `/products` | Filters: `type`, `brand`, `size`, `minPrice`, `maxPrice`, `q` (fuzzy search), `make`/`model`/`year` |
| GET | `/products/:id` | Full spec + images + fitments |
| GET | `/products/autocomplete?q=` | Fast prefix search for the search bar |
| POST/PUT/DELETE | `/admin/products/:id` | `products.write` permission |
| POST | `/admin/products/:id/images` | Upload to S3-compatible storage |

### Cart & Checkout
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/cart` | Guest carts keyed by session cookie, merged into account cart on login |
| PATCH | `/cart/items/:productId` | Update quantity |
| DELETE | `/cart/items/:productId` | |
| POST | `/orders` | Creates order from cart, decrements inventory transactionally |
| POST | `/orders/:id/pay` | Kicks off payment (M-Pesa STK push, card charge, etc.) |
| GET | `/orders/:id` | Order + live status |
| GET | `/orders` | Customer's own order history |

### Payments (webhooks)
| Method | Path | Notes |
|---|---|---|
| POST | `/webhooks/mpesa/callback` | Safaricom Daraja STK push result |
| POST | `/webhooks/card/callback` | Card processor callback |

### Admin — Inventory
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/inventory` | Filter by branch, low-stock flag |
| POST | `/admin/inventory/adjust` | Manual stock adjustment (writes `stock_movements`) |
| GET/POST | `/admin/purchase-orders` | Supplier restocking |
| GET | `/admin/inventory/reorder-alerts` | Below `reorder_level` |

### Admin — Sales & Reports
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard/summary` | Today/month/year sales, active customers, inventory value |
| GET | `/admin/reports/sales?period=` | daily/weekly/monthly/annual |
| GET | `/admin/reports/export?format=pdf\|xlsx\|csv` | |
| GET | `/admin/reports/tax` | |

### Admin — CRM
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/admin/leads` | |
| POST | `/admin/leads/:id/followups` | |
| GET/POST | `/admin/support-tickets` | |

### Branches
| Method | Path | Notes |
|---|---|---|
| GET | `/branches` | Public: locations for delivery/pickup selection |
| POST/PUT | `/admin/branches` | `branches.write` |

---

## 4. Key Design Decisions

- **Tire specs split from `products`** — keeps the base product table generic across tires/rims/accessories; only tires join `tire_specs`.
- **`stock_movements` as source of truth** — `inventory.quantity` is a maintained cache for fast reads; the ledger gives you an audit trail and lets reporting reconstruct stock at any point in time.
- **Price snapshotting in `order_items`** — protects historical orders/invoices from later price changes.
- **Guest checkout** — `carts.customer_id` is nullable, keyed by session, merged on login — required since the brief asks for guest checkout alongside accounts.
- **Full-text + composite indexes** — `idx_products_search` (name/description) and `idx_tire_specs_size` (width/aspect/diameter) back the "search by tire size" requirement without needing Elasticsearch for v1; add Elasticsearch once catalog size or search complexity (typo-tolerance, vehicle-model matching) outgrows Postgres full-text.
- **RBAC via `roles`/`permissions` join tables** rather than a single `role` enum column — lets you add branch-manager-only permissions later without a migration that touches every user row.

---

## 5. Suggested Build Order

1. Identity & Access + Catalog (read-only) → gets the storefront browsing live
2. Cart, Orders, Payments (M-Pesa first — highest-volume method in Kenya) → gets checkout live
3. Inventory + Branches → unlocks stock accuracy and multi-branch
4. Admin dashboard aggregate queries → reporting
5. CRM + Support tickets → last, lowest coupling to the rest

---

## 6. Implementation notes (steps 2–3, as built)

Deviations from §2–3 and additions, in one place:

**Schema**
- `orders` stores `contact` and `delivery_address` as JSONB snapshots instead of `delivery_address_id` (supports guest checkout; survives profile edits). It also has `delivery_method` (`delivery|pickup`), `notes`, `idempotency_key` (unique) and `guest_token_hash`.
- `order_items` snapshots `product_name` and `sku` alongside `unit_price`.
- New `order_status_history` (customer-facing timeline + staff audit trail) and `order_number_seq` (order numbers `WG10000`, `WG10001`, …).
- `payments` gains `phone`, `checkout_request_id` (unique), `merchant_request_id`, `failure_reason`, `raw_callback`, `updated_at`; a partial unique index stops one M-Pesa receipt settling two payments.
- `carts` has partial unique indexes (one cart per customer / per guest session); `cart_items.saved_for_later` implements "save for later".
- `inventory.quantity` has `CHECK (quantity >= 0)` as a last line of defence against overselling.
- Order totals are rounded to whole KES (STK push only accepts integers).

**API additions / changes**
| Method | Path | Notes |
|---|---|---|
| POST | `/orders` | Optional auth. `Idempotency-Key` header. Guests receive a one-time `guestToken` → send as `X-Order-Token` |
| GET | `/orders/track?orderNumber=&phone=` | Public status lookup, no PII returned |
| POST | `/orders/:id/pay` | `{method: mpesa\|cod\|bank_transfer\|card, phone?, reference?}`; card returns 501 |
| GET | `/payments/:id` · POST `/payments/:id/verify` | Poll / ask Daraja directly (recovers lost callbacks) |
| POST | `/webhooks/mpesa/callback/:secret` | Secret path segment authenticates Daraja (`MPESA_CALLBACK_SECRET`) |
| PATCH | `/admin/orders/:id/status` | Forward-only state machine; cancelling restocks and flags `refundRequired` if already paid |
| POST | `/admin/payments/:id/confirm` | Bank transfer received / cash banked |
| PATCH | `/cart/items/:productId/save-for-later` | `{saved: boolean}` |
| GET | `/admin/inventory/reorder-alerts` | |

**Behaviour**
- Stock is reserved at order creation from a single branch; unpaid orders are cancelled and restocked after `ORDER_PAYMENT_TTL_MINUTES` (bank transfers get `BANK_TRANSFER_TTL_HOURS`).
- Guest carts are keyed by an httpOnly `wg_session` cookie (or `X-Cart-Session` for native clients) and merge into the customer's cart on the first authenticated request.
- Domain events (`order.created`, `order.status_changed`, `payment.completed`, `payment.orphaned`) are emitted via `@nestjs/event-emitter` — notifications and the WebSocket gateway should subscribe rather than being called from services.
- Known gaps: branch-scoped staff visibility (needs `staff_assignments`), refunds (flagged, not executed), card payments, throttler storage is per-process (move to Redis before running several API replicas).
