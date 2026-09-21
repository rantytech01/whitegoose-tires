import { MigrationInterface, QueryRunner } from "typeorm";

// Step 1 of the build order (docs/database-and-api-design.md §5):
// Identity & Access + Catalog. Later migrations add inventory, sales,
// CRM, branches, reporting, audit, and content tables.
export class InitIdentityAndCatalog1732000000000 implements MigrationInterface {
  name = "InitIdentityAndCatalog1732000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await queryRunner.query(`
      CREATE TABLE users (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email             VARCHAR(255) UNIQUE NOT NULL,
        phone             VARCHAR(20) UNIQUE,
        password_hash     VARCHAR(255),
        full_name         VARCHAR(150) NOT NULL,
        user_type         VARCHAR(20) NOT NULL DEFAULT 'customer',
        mfa_enabled       BOOLEAN DEFAULT FALSE,
        mfa_secret        VARCHAR(255),
        email_verified_at TIMESTAMPTZ,
        is_active         BOOLEAN DEFAULT TRUE,
        otp_code_hash     VARCHAR(255),
        otp_expires_at    TIMESTAMPTZ,
        google_id         VARCHAR(100) UNIQUE,
        created_at        TIMESTAMPTZ DEFAULT now(),
        updated_at        TIMESTAMPTZ DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE roles (
        id    SERIAL PRIMARY KEY,
        name  VARCHAR(50) UNIQUE NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE permissions (
        id    SERIAL PRIMARY KEY,
        code  VARCHAR(80) UNIQUE NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE role_permissions (
        role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE user_roles (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role_id INT REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(255) NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        revoked_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Extension beyond the base schema doc: mirrors refresh_tokens so
    // forgot/reset-password has the same hashed/single-use/expiring shape.
    await queryRunner.query(`
      CREATE TABLE password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(255) NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        used_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE brands (
        id       SERIAL PRIMARY KEY,
        name     VARCHAR(80) UNIQUE NOT NULL,
        logo_url VARCHAR(255)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE categories (
        id   SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE products (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sku           VARCHAR(40) UNIQUE NOT NULL,
        category_id   INT REFERENCES categories(id),
        brand_id      INT REFERENCES brands(id),
        name          VARCHAR(150) NOT NULL,
        condition     VARCHAR(10) NOT NULL,
        description   TEXT,
        price         NUMERIC(12,2) NOT NULL,
        discount_pct  NUMERIC(5,2) DEFAULT 0,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT now(),
        updated_at    TIMESTAMPTZ DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE tire_specs (
        product_id          UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        width_mm            SMALLINT NOT NULL,
        aspect_ratio        SMALLINT NOT NULL,
        rim_diameter_in     SMALLINT NOT NULL,
        load_index          SMALLINT,
        speed_rating        VARCHAR(3),
        tread_condition_pct SMALLINT,
        season              VARCHAR(12)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE product_images (
        id         SERIAL PRIMARY KEY,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        url        VARCHAR(255) NOT NULL,
        sort_order SMALLINT DEFAULT 0
      );
    `);

    await queryRunner.query(`
      CREATE TABLE vehicle_fitments (
        id         SERIAL PRIMARY KEY,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        make       VARCHAR(50),
        model      VARCHAR(50),
        year_from  SMALLINT,
        year_to    SMALLINT
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_products_name ON products (name);`);
    await queryRunner.query(
      `CREATE INDEX idx_products_search ON products USING GIN (to_tsvector('english', name));`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_tire_specs_size ON tire_specs (width_mm, aspect_ratio, rim_diameter_in);`,
    );
    await queryRunner.query(`CREATE INDEX idx_fitments_make_model ON vehicle_fitments (make, model);`);

    // Seed the roles the RBAC guard/brief expect out of the box.
    await queryRunner.query(`
      INSERT INTO roles (name) VALUES
        ('super_admin'), ('branch_manager'), ('sales_staff'), ('inventory_clerk'), ('customer');
    `);
    await queryRunner.query(`
      INSERT INTO categories (name, slug) VALUES
        ('Tires', 'tires'), ('Rims', 'rims'), ('Accessories', 'accessories');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS vehicle_fitments;`);
    await queryRunner.query(`DROP TABLE IF EXISTS product_images;`);
    await queryRunner.query(`DROP TABLE IF EXISTS tire_specs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS products;`);
    await queryRunner.query(`DROP TABLE IF EXISTS categories;`);
    await queryRunner.query(`DROP TABLE IF EXISTS brands;`);
    await queryRunner.query(`DROP TABLE IF EXISTS password_reset_tokens;`);
    await queryRunner.query(`DROP TABLE IF EXISTS refresh_tokens;`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_roles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS role_permissions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS permissions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS roles;`);
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
  }
}
