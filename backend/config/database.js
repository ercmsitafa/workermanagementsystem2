const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initTables();
  }
});

function initTables() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'worker',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      department_id INTEGER,
      position TEXT,
      salary REAL,
      hire_date DATE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      manager_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      date DATE NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS salary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      base_salary REAL NOT NULL,
      deductions REAL DEFAULT 0,
      net_salary REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      leave_type TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS performance_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      review_date DATE NOT NULL,
      rating REAL,
      comments TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER,
      title TEXT NOT NULL,
      file_type TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      type TEXT DEFAULT 'string',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(
      'INSERT OR IGNORE INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      ['admin', 'admin@company.com', hashedPassword, 'admin']
    );
    console.log('SQLite tables initialized');
  });
}

// Keep the existing SQLite database as the active store until a verified
// migration is explicitly completed. Route modules use these Promise helpers.
function executeQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const statement = sql.trim().toUpperCase();
    if (statement.startsWith('SELECT') || statement.startsWith('PRAGMA') || statement.startsWith('WITH')) {
      db.all(sql, params, (error, rows) => {
        if (error) return reject(error);
        resolve({ success: true, data: rows });
      });
      return;
    }
    db.run(sql, params, function (error) {
      if (error) return reject(error);
      resolve({ success: true, data: [], insertId: this.lastID, affectedRows: this.changes });
    });
  });
}

function getSingleRow(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve({ success: true, data: row || null });
    });
  });
}

module.exports = db;
module.exports.executeQuery = executeQuery;
module.exports.getSingleRow = getSingleRow;
