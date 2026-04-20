require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => console.log('✅ DB connected'));
pool.on('error', (err) => console.error('❌ DB error', err.message));

// Test connection on startup
pool.query('SELECT NOW()').then(r => {
  console.log('✅ DB ready:', r.rows[0].now);
}).catch(e => {
  console.error('❌ DB connection failed:', e.message);
});

module.exports = pool;
