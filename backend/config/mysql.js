const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    const host = process.env.DB_HOST || '127.0.0.1';
    const user = process.env.DB_USER || 'root';
    const database = process.env.DB_NAME;
    if (!database) throw new Error('DB_NAME is required. Create the database in phpMyAdmin and configure backend/.env.');

    pool = mysql.createPool({
      host,
      port: Number(process.env.DB_PORT || 3306),
      user,
      password: process.env.DB_PASSWORD || '',
      database,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
      queueLimit: 0,
      charset: 'utf8mb4',
      decimalNumbers: true
    });
  }
  return pool;
}

async function testConnection() {
  const connection = await getPool().getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

module.exports = { getPool, testConnection };
