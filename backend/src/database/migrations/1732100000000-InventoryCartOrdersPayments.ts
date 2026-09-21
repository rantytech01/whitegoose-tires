import { MigrationInterface, QueryRunner } from "typeorm";

// Build-order steps 2 + 3 (docs/database-and-api-design.md §5): the sales
// tables plus the minimum branch/inventory tables checkout needs in order to
// decrement stock transactionally. Suppliers/purchase orders follow later.
export class InventoryCartOrdersPayments1732100000000 implements MigrationInterface {
  name = "InventoryCartOrdersPayments1732100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Branches & inventory -------------------------------------------
    await queryRunner.query(`
      CREATE TABLE branches (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(80) NOT NULL,
        address   VARCHAR(255),
        city      VARCHAR(60),
        phone     VARCHAR(20),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE inventory (
        id            BIGSERIAL PRIMARY KEY,
        product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        branch_id     INT  NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        quantity      INT  NOT NULL DEFAULT 0,
        reorder_level INT  NOT NULL DEFAULT 5,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_inventory_product_branch UNIQUE (product_id, branch_id),
        -- Last line of defence against overselling if application logic ever regresses.
        CONSTRAINT ck_inventory_quantity_non_negative CHECK (quantity >= 0)
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_inventory_branch ON inventory (branch_id);`);

    await queryRunner.query(`
      CREATE TABLE stock_movements (
        id           BIGSERIAL PRIMARY KEY,
        product_id   UUID NOT NULL REFERENCES products(id),
        branch_id    INT  NOT NULL REFERENCES branches(id),
        change_qty   INT  NOT NULL,
        reason       VARCHAR(30) NOT NULL,
        reference_id UUID,
        created_by   UUID REFERENCES users(id),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX idx_stock_movements_product_created ON stock_movements (product_id, created_at DESC);`,
    );
    await queryRunner.query(`CREATE INDEX idx_stock_movements_reference ON stock_movements (reference_id);`);

    // ---- Carts -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE carts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_id  VARCHAR(100),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_carts_owner CHECK (customer_id IS NOT NULL OR session_id IS NOT NULL)
      );
    `);
    // One live cart per customer / per guest session; also makes
    // get-or-create race-safe (loser of the race hits the unique index).
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_carts_customer ON carts (customer_id) WHERE customer_id IS NOT NULL;`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_carts_session ON carts (session_id) WHERE customer_id IS NULL AND session_id IS NOT NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE cart_items (
        cart_id         UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity        INT  NOT NULL CHECK (quantity > 0),
        saved_for_later BOOLEAN NOT NULL DEFAULT FALSE,
        added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (cart_id, product_id)
      );
    `);

    // ---- Orders ----------------------------------------------------------
    await queryRunner.query(`CREATE SEQUENCE order_number_seq START 10000;`);

    // Differences from the schema doc: contact/delivery_address are JSONB
    // snapshots (supports guest checkout and survives profile edits) instead
    // of delivery_address_id, which returns with the customers module.
    await queryRunner.query(`
      CREATE TABLE orders (
        id               UUID PRIMARY KEY,
        order_number     VARCHAR(20) NOT NULL UNIQUE,
        customer_id      UUID REFERENCES users(id),
        branch_id        INT  NOT NULL REFERENCES branches(id),
        status           VARCHAR(20) NOT NULL DEFAULT 'pending',
        delivery_method  VARCHAR(10) NOT NULL,
        subtotal         NUMERIC(14,2) NOT NULL,
        delivery_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
        total            NUMERIC(14,2) NOT NULL,
        contact          JSONB NOT NULL,
        delivery_address JSONB,
        notes            TEXT,
        idempotency_key  VARCHAR(120) UNIQUE,
        guest_token_hash VARCHAR(64),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_orders_status CHECK (status IN ('pending','confirmed','packed','dispatched','delivered','cancelled')),
        CONSTRAINT ck_orders_delivery_method CHECK (delivery_method IN ('delivery','pickup'))
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_orders_customer ON orders (customer_id);`);
    await queryRunner.query(`CREATE INDEX idx_orders_status_created ON orders (status, created_at);`);
    await queryRunner.query(`CREATE INDEX idx_orders_branch_created ON orders (branch_id, created_at DESC);`);

    await queryRunner.query(`
      CREATE TABLE order_items (
        id           BIGSERIAL PRIMARY KEY,
        order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id   UUID NOT NULL REFERENCES products(id),
        product_name VARCHAR(150) NOT NULL,
        sku          VARCHAR(40)  NOT NULL,
        quantity     INT NOT NULL CHECK (quantity > 0),
        unit_price   NUMERIC(12,2) NOT NULL
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_order_items_order ON order_items (order_id);`);
    await queryRunner.query(`CREATE INDEX idx_order_items_product ON order_items (product_id);`);

    await queryRunner.query(`
      CREATE TABLE order_status_history (
        id          BIGSERIAL PRIMARY KEY,
        order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        from_status VARCHAR(20),
        to_status   VARCHAR(20) NOT NULL,
        changed_by  UUID REFERENCES users(id),
        note        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at);`);

    // ---- Payments --------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE payments (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        method              VARCHAR(20) NOT NULL,
        amount              NUMERIC(14,2) NOT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        provider_ref        VARCHAR(100),
        phone               VARCHAR(20),
        checkout_request_id VARCHAR(100),
        merchant_request_id VARCHAR(100),
        failure_reason      VARCHAR(255),
        raw_callback        JSONB,
        paid_at             TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_payments_method CHECK (method IN ('mpesa','card','bank_transfer','cod')),
        CONSTRAINT ck_payments_status CHECK (status IN ('pending','completed','failed','refunded'))
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_payments_order ON payments (order_id);`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_payments_checkout_request ON payments (checkout_request_id) WHERE checkout_request_id IS NOT NULL;`,
    );
    // A given M-Pesa receipt can settle at most one payment.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_payments_mpesa_receipt ON payments (provider_ref) WHERE method = 'mpesa' AND provider_ref IS NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS payments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_status_history;`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS orders;`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS order_number_seq;`);
    await queryRunner.query(`DROP TABLE IF EXISTS cart_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS carts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movements;`);
    await queryRunner.query(`DROP TABLE IF EXISTS inventory;`);
    await queryRunner.query(`DROP TABLE IF EXISTS branches;`);
  }
}
