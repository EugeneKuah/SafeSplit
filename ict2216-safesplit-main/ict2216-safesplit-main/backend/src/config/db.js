const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} must be provided through environment variables.`);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'db', 'schema.sql');

async function initDb() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schemaSql);
}

module.exports = { pool, initDb };
