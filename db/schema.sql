-- ============================================================================
--  Sherubtse PrintHub - PostgreSQL schema
--  All deadlines are TIMESTAMPTZ (absolute instants). The application displays
--  them in Bhutan time (Asia/Thimphu, UTC+6, no daylight saving).
-- ============================================================================

-- ---------- USERS ----------------------------------------------------------
CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    full_name      VARCHAR(100)  NOT NULL,
    email          VARCHAR(150)  NOT NULL UNIQUE,
    password_hash  TEXT          NOT NULL,
    role           VARCHAR(10)   NOT NULL DEFAULT 'student'
                   CHECK (role IN ('student', 'staff', 'admin')),
    student_no     VARCHAR(30),
    department     VARCHAR(100),
    phone          VARCHAR(20),
    avatar         VARCHAR(255),
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_lower CHECK (email = LOWER(email))
);

-- ---------- CATALOGUE ------------------------------------------------------
CREATE TABLE categories (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL UNIQUE,
    description  TEXT
);

CREATE TABLE services (
    id                 SERIAL PRIMARY KEY,
    category_id        INTEGER       NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name               VARCHAR(100)  NOT NULL UNIQUE,
    slug               VARCHAR(120)  NOT NULL UNIQUE,
    description        TEXT          NOT NULL,
    options_text       VARCHAR(255),
    icon               VARCHAR(50)   NOT NULL DEFAULT 'bi-printer',
    price              NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    pricing_type       VARCHAR(10)   NOT NULL DEFAULT 'per_page'
                       CHECK (pricing_type IN ('per_page', 'per_copy')),
    unit_label         VARCHAR(20)   NOT NULL DEFAULT 'page',
    colour_mode        VARCHAR(10)   NOT NULL DEFAULT 'choice'
                       CHECK (colour_mode IN ('bw', 'colour', 'choice')),
    uses_print_options BOOLEAN       NOT NULL DEFAULT TRUE,   -- sides / quality / colour apply
    requires_document  BOOLEAN       NOT NULL DEFAULT TRUE,   -- binding & lamination may be walk-in items
    is_active          BOOLEAN       NOT NULL DEFAULT TRUE,
    sort_order         INTEGER       NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------- DOCUMENTS ------------------------------------------------------
CREATE TABLE documents (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name  VARCHAR(255) NOT NULL,
    stored_name    VARCHAR(100) NOT NULL UNIQUE,   -- random name on disk (never user supplied)
    mime_type      VARCHAR(120) NOT NULL,
    extension      VARCHAR(10)  NOT NULL,
    file_size      INTEGER      NOT NULL CHECK (file_size > 0),
    page_count     INTEGER      CHECK (page_count IS NULL OR page_count > 0),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- ORDERS ---------------------------------------------------------
CREATE SEQUENCE order_no_seq START 1;

CREATE TABLE orders (
    id                    SERIAL PRIMARY KEY,
    order_no              VARCHAR(20)   NOT NULL UNIQUE,            -- e.g. SH2026001
    user_id               INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                VARCHAR(20)   NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','accepted','printing','ready','collected','rejected','cancelled')),
    subtotal              NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    urgent_surcharge      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (urgent_surcharge >= 0),
    total                 NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    is_urgent             BOOLEAN       NOT NULL DEFAULT FALSE,
    urgent_status         VARCHAR(10)   NOT NULL DEFAULT 'none'
                          CHECK (urgent_status IN ('none','requested','approved','rejected')),
    requested_deadline    TIMESTAMPTZ   NOT NULL,                   -- student's preferred collection time
    estimated_completion  TIMESTAMPTZ,                              -- set ONLY by an administrator
    is_delayed            BOOLEAN       NOT NULL DEFAULT FALSE,
    delay_reason          TEXT,
    payment_method        VARCHAR(40)   NOT NULL,
    notes                 TEXT,
    qr_token              VARCHAR(40)   NOT NULL UNIQUE,
    notified_24h          BOOLEAN       NOT NULL DEFAULT FALSE,
    notified_3h           BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
    id                  SERIAL PRIMARY KEY,
    order_id            INTEGER       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_id          INTEGER       NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    document_id         INTEGER       REFERENCES documents(id) ON DELETE SET NULL,
    service_name        VARCHAR(100)  NOT NULL,                      -- snapshot at order time
    document_name       VARCHAR(255),                                -- snapshot at order time
    pages               INTEGER       NOT NULL DEFAULT 1 CHECK (pages > 0),
    copies              INTEGER       NOT NULL DEFAULT 1 CHECK (copies > 0 AND copies <= 1000),
    paper_size          VARCHAR(2)    NOT NULL DEFAULT 'A4' CHECK (paper_size IN ('A4','A3')),
    colour_mode         VARCHAR(10)   NOT NULL DEFAULT 'bw'    CHECK (colour_mode IN ('bw','colour')),
    sides               VARCHAR(10)   NOT NULL DEFAULT 'single' CHECK (sides IN ('single','double')),
    orientation         VARCHAR(10)   NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape')),
    quality             VARCHAR(10)   NOT NULL DEFAULT 'normal' CHECK (quality IN ('normal','high')),
    binding_service_id  INTEGER       REFERENCES services(id) ON DELETE SET NULL,
    binding_name        VARCHAR(100),
    instructions        TEXT,
    unit_price          NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    binding_cost        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (binding_cost >= 0),
    line_total          NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
);

-- ---------- PAYMENTS -------------------------------------------------------
CREATE TABLE payments (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER       NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    method       VARCHAR(40)   NOT NULL,
    amount       NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    status       VARCHAR(10)   NOT NULL DEFAULT 'unpaid'
                 CHECK (status IN ('unpaid','paid','refunded')),
    reference    VARCHAR(100),
    paid_at      TIMESTAMPTZ,
    verified_by  INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------- NOTIFICATIONS --------------------------------------------------
CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id    INTEGER      REFERENCES orders(id) ON DELETE CASCADE,
    type        VARCHAR(30)  NOT NULL,   -- accepted, printing, ready, deadline, delay, rejected, ...
    title       VARCHAR(150) NOT NULL,
    message     TEXT         NOT NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- FEEDBACK -------------------------------------------------------
CREATE TABLE feedback (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER      NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating       SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      TEXT,
    admin_reply  TEXT,
    is_visible   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- ORDER HISTORY / COLLECTION ------------------------------------
CREATE TABLE order_status_history (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      VARCHAR(20)  NOT NULL,
    note        TEXT,
    changed_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    changed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_records (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER      NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    collected_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,   -- admin who handed over
    method        VARCHAR(10)  NOT NULL DEFAULT 'qr' CHECK (method IN ('qr','manual')),
    note          TEXT,
    collected_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- SETTINGS / CONTACT / SESSIONS ---------------------------------
CREATE TABLE settings (
    key    VARCHAR(60) PRIMARY KEY,
    value  JSONB       NOT NULL
);

CREATE TABLE contact_messages (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(150) NOT NULL,
    subject     VARCHAR(150) NOT NULL,
    message     TEXT         NOT NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE "session" (
    sid     VARCHAR      NOT NULL PRIMARY KEY,
    sess    JSON         NOT NULL,
    expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX idx_session_expire ON "session" (expire);

-- ---------- INDEXES --------------------------------------------------------
CREATE INDEX idx_documents_user        ON documents (user_id);
CREATE INDEX idx_orders_user           ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status         ON orders (status);
CREATE INDEX idx_orders_deadline       ON orders (requested_deadline);
CREATE INDEX idx_order_items_order     ON order_items (order_id);
CREATE INDEX idx_notifications_user    ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX idx_status_history_order  ON order_status_history (order_id, changed_at);
CREATE INDEX idx_services_category     ON services (category_id);
