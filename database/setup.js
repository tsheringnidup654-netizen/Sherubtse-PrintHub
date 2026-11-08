/**
 * Creates the PostgreSQL role + database (if missing), then runs schema.sql and seed.sql.
 *   npm run db:setup            -> schema + sample data (WIPES existing tables)
 *   npm run db:setup -- --no-seed -> schema only
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'printhub',
  password: process.env.DB_PASSWORD || 'printhub123',
  database: process.env.DB_NAME || 'sherubtse_printhub',
};

async function ensureDatabase() {
  // Try connecting directly first - succeeds when role + DB already exist.
  try {
    const c = new Client(DB);
    await c.connect();
    await c.end();
    return;
  } catch (_) { /* fall through and try to create them as admin */ }

  const admin = new Client({
    host: DB.host, port: DB.port, database: 'postgres',
    user: process.env.PG_ADMIN_USER || 'postgres',
    password: process.env.PG_ADMIN_PASSWORD || 'postgres',
  });
  await admin.connect();
  const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [DB.user]);
  if (!role.rowCount) await admin.query(`CREATE ROLE "${DB.user}" LOGIN PASSWORD '${DB.password.replace(/'/g, "''")}'`);
  const db = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB.database]);
  if (!db.rowCount) await admin.query(`CREATE DATABASE "${DB.database}" OWNER "${DB.user}"`);
  await admin.end();
  console.log(`Created database "${DB.database}" and role "${DB.user}".`);
}

async function run() {
  await ensureDatabase();
  const client = new Client(DB);
  await client.connect();
  const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  await client.query(read('schema.sql'));
  console.log('Schema created.');
  if (!process.argv.includes('--no-seed')) {
    await client.query(read('seed.sql'));
    console.log('Sample data inserted.');
  }
  await client.end();
  console.log('Done. Admin: admin@sherubtse.edu.bt / Admin@123 | Student: 02230001.sherubtse@rub.edu.bt / Student@123');
}

run().catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
