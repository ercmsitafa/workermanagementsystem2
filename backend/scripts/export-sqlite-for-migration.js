/**
 * Safe, non-destructive SQLite inventory/export helper.
 *
 * This script does NOT write to MySQL or modify/delete SQLite data. It creates
 * a timestamped JSON export plus a schema inventory so the migration can be
 * reviewed before switching databases.
 *
 * Run from backend/: node scripts/export-sqlite-for-migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const outputDir = path.join(__dirname, '..', 'migration-backups');

if (!fs.existsSync(dbPath)) {
  console.error('SQLite database not found at:', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (error) => {
  if (error) {
    console.error('Could not open SQLite database read-only:', error.message);
    process.exit(1);
  }
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const tables = await all(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const exportData = {
    generatedAt: new Date().toISOString(),
    source: 'SQLite read-only export; source database was not modified',
    tables: {}
  };

  for (const table of tables) {
    const columns = await all(`PRAGMA table_info("${table.name.replace(/"/g, '""')}")`);
    const rows = await all(`SELECT * FROM "${table.name.replace(/"/g, '""')}"`);
    exportData.tables[table.name] = {
      createSql: table.sql,
      columns,
      rowCount: rows.length,
      rows
    };
    console.log(`${table.name}: ${rows.length} rows`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `sqlite-export-${stamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), { flag: 'wx' });
  console.log('\nRead-only export created:', outputPath);
  console.log('Keep this file secure: it may contain employee and account data.');
  console.log('No SQLite data was changed and no MySQL tables were created.');
}

main()
  .catch((error) => {
    console.error('Export failed:', error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
