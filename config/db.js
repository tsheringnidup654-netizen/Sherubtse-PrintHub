/**
 * PostgreSQL connection pool.
 * Every connection is switched to Bhutan time (Asia/Thimphu) so SQL date maths matches what students see.
 *   db.query(sql, params)  - parameterised query (prevents SQL injection)
 *   db.tx(async (client) => {...}) - several queries in one transaction
 */
const { Pool } = require('pg');
const env = require('./env');

// `options` sets the session time zone at connection start (no extra query needed)
const pool = new Pool({ ...env.db, max: 10, idleTimeoutMillis: 30000, options: '-c timezone=Asia/Thimphu' });

pool.on('error', (err) => console.error('Unexpected PostgreSQL error:', err.message));

const query = (text, params) => pool.query(text, params);

async function tx(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
