-- ============================================================================
--  Sherubtse PrintHub - PostgreSQL schema
--  All date/times are TIMESTAMPTZ (absolute instants). The application shows
--  them in Bhutan time (Asia/Thimphu, UTC+6, no daylight saving).
--  Running this file WIPES the existing PrintHub tables and recreates them.
-- ============================================================================

DROP TABLE IF EXISTS contact_messages     CASCADE;
DROP TABLE IF EXISTS collection_records   CASCADE;
DROP TABLE IF EXISTS order_status_history CASCADE;
DROP TABLE IF EXISTS feedback             CASCADE;
DROP TABLE IF EXISTS notifications        CASCADE;
DROP TABLE IF EXISTS payments             CASCADE;
DROP TABLE IF EXISTS order_items          CASCADE;
DROP TABLE IF EXISTS orders               CASCADE;
DROP TABLE IF EXISTS cart_items           CASCADE;
DROP TABLE IF EXISTS documents            CASCADE;
DROP TABLE IF EXISTS services             CASCADE;
DROP TABLE IF EXISTS categories           CASCADE;
DROP TABLE IF EXISTS settings             CASCADE;
DROP TABLE IF EXISTS users                CASCADE;
DROP TABLE IF EXISTS "session"            CASCADE;
DROP SEQUENCE IF EXISTS order_number_seq;

-- ---------- USERS ----------------------------------------------------------
CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    student_id     VARCHAR(20) UNIQUE,
    full_name      VARCHAR(120) NOT NULL,
    email          VARCHAR(160) NOT NULL UNIQUE,
    password_hash  VARCHAR(100) NOT NULL,                 -- bcrypt hash, never the password
    role           VARCHAR(10)  NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    phone          VARCHAR(20),
    programme      VARCHAR(120),
    avatar         VARCHAR(255),
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- CATALOGUE ------------------------------------------------------
CREATE TABLE categories (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(80) NOT NULL UNIQUE,
    slug         VARCHAR(80) NOT NULL UNIQUE,
    description  TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE services (
    id            SERIAL PRIMARY KEY,
    category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name          VARCHAR(100) NOT NULL,
    slug          VARCHAR(100) NOT NULL UNIQUE,
    description   TEXT NOT NULL,
    icon          VARCHAR(50)  NOT NULL DEFAULT 'bi-printer',
    -- print          : price per page, affected by size / colour / sides / quality
    -- per_page_flat  : price per page, only paper size matters (lamination)
    -- per_set        : price per bound document (binding)
    pricing_type  VARCHAR(15)  NOT NULL DEFAULT 'print' CHECK (pricing_type IN ('print', 'per_page_flat', 'per_set')),
    base_price    NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),     -- black & white / standard price
    colour_price  NUMERIC(10,2) CHECK (colour_price >= 0),            -- NULL = colour not offered
    unit_label    VARCHAR(30)  NOT NULL DEFAULT 'per page',
    options_text  VARCHAR(255),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- DOCUMENTS (private uploads) ------------------------------------
CREATE TABLE documents (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name  VARCHAR(255) NOT NULL,
    stored_name    VARCHAR(255) NOT NULL UNIQUE,          -- random name on disk
    mime_type      VARCHAR(120) NOT NULL,
    size_bytes     BIGINT NOT NULL CHECK (size_bytes > 0),
    page_count     INTEGER CHECK (page_count > 0),
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- CART -----------------------------------------------------------
CREATE TABLE cart_items (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    service_id   INTEGER NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
    document_id  INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    pages        INTEGER NOT NULL CHECK (pages BETWEEN 1 AND 5000),
    copies       INTEGER NOT NULL CHECK (copies BETWEEN 1 AND 1000),
    paper_size   VARCHAR(2)  NOT NULL DEFAULT 'A4'       CHECK (paper_size IN ('A4','A3')),
    colour_mode  VARCHAR(6)  NOT NULL DEFAULT 'bw'       CHECK (colour_mode IN ('bw','colour')),
    sided        VARCHAR(6)  NOT NULL DEFAULT 'single'   CHECK (sided IN ('single','double')),
    orientation  VARCHAR(9)  NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
    quality      VARCHAR(6)  NOT NULL DEFAULT 'normal'   CHECK (quality IN ('normal','high')),
    binding      VARCHAR(7)  NOT NULL DEFAULT 'none'     CHECK (binding IN ('none','spiral','project')),
    instructions TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- ORDERS ---------------------------------------------------------
CREATE SEQUENCE order_number_seq START 1;

CREATE TABLE orders (
    id                    SERIAL PRIMARY KEY,
    order_number          VARCHAR(20) NOT NULL UNIQUE,              -- e.g. SH2026001
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                VARCHAR(12) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','accepted','printing','ready','collected','rejected','cancelled')),
    is_urgent             BOOLEAN NOT NULL DEFAULT FALSE,
    urgent_status         VARCHAR(10) NOT NULL DEFAULT 'none' CHECK (urgent_status IN ('none','requested','approved','rejected')),
    subtotal              NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    urgent_fee            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (urgent_fee >= 0),
    total                 NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    collection_deadline   TIMESTAMPTZ NOT NULL,   -- requested by the student: the countdown target
    estimated_completion  TIMESTAMPTZ,            -- set ONLY by an administrator
    is_delayed            BOOLEAN NOT NULL DEFAULT FALSE,
    delay_note            TEXT,
    notes                 TEXT,
    qr_token              VARCHAR(64) NOT NULL UNIQUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    service_id    INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    service_name  VARCHAR(100) NOT NULL,                      -- snapshot at order time
    pages         INTEGER NOT NULL CHECK (pages BETWEEN 1 AND 5000),
    copies        INTEGER NOT NULL CHECK (copies BETWEEN 1 AND 1000),
    paper_size    VARCHAR(2)  NOT NULL DEFAULT 'A4'       CHECK (paper_size IN ('A4','A3')),
    colour_mode   VARCHAR(6)  NOT NULL DEFAULT 'bw'       CHECK (colour_mode IN ('bw','colour')),
    sided         VARCHAR(6)  NOT NULL DEFAULT 'single'   CHECK (sided IN ('single','double')),
    orientation   VARCHAR(9)  NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
    quality       VARCHAR(6)  NOT NULL DEFAULT 'normal'   CHECK (quality IN ('normal','high')),
    binding       VARCHAR(7)  NOT NULL DEFAULT 'none'     CHECK (binding IN ('none','spiral','project')),
    instructions  TEXT,
    line_total    NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
);

-- ---------- PAYMENTS -------------------------------------------------------
CREATE TABLE payments (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    method      VARCHAR(30) NOT NULL,
    amount      NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status      VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
    reference   VARCHAR(80),
    paid_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- NOTIFICATIONS --------------------------------------------------
CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    order_id    INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    type        VARCHAR(30)  NOT NULL,
    title       VARCHAR(160) NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- one "deadline approaching" alert per user + order + type
CREATE UNIQUE INDEX uq_notif_once ON notifications (user_id, order_id, type)
    WHERE type IN ('deadline_approaching', 'deadline_risk');

-- ---------- FEEDBACK -------------------------------------------------------
CREATE TABLE feedback (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    order_id     INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      TEXT,
    is_visible   BOOLEAN NOT NULL DEFAULT TRUE,
    admin_reply  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- ORDER HISTORY / COLLECTION ------------------------------------
CREATE TABLE order_status_history (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      VARCHAR(12) NOT NULL,
    note        TEXT,
    changed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_records (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    handed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- admin who handed over
    verified_via  VARCHAR(10) NOT NULL DEFAULT 'qr' CHECK (verified_via IN ('qr','manual')),
    note          TEXT,
    collected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SETTINGS / CONTACT / SESSIONS ---------------------------------
CREATE TABLE settings (
    key    VARCHAR(60) PRIMARY KEY,
    value  TEXT NOT NULL
);

CREATE TABLE contact_messages (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    email       VARCHAR(160) NOT NULL,
    subject     VARCHAR(160) NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- express-session store (connect-pg-simple)
CREATE TABLE "session" (
    sid     VARCHAR      NOT NULL PRIMARY KEY,
    sess    JSON         NOT NULL,
    expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX idx_session_expire ON "session" (expire);

-- ---------- INDEXES --------------------------------------------------------
CREATE INDEX idx_cart_user       ON cart_items (user_id);
CREATE INDEX idx_documents_user  ON documents (user_id);
CREATE INDEX idx_orders_user     ON orders (user_id);
CREATE INDEX idx_orders_status   ON orders (status);
CREATE INDEX idx_orders_deadline ON orders (collection_deadline);
CREATE INDEX idx_items_order     ON order_items (order_id);
CREATE INDEX idx_history_order   ON order_status_history (order_id);
CREATE INDEX idx_notif_user      ON notifications (user_id, is_read);
