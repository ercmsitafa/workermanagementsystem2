# MySQL setup (XAMPP)

1. Start **MySQL** in XAMPP Control Panel.
2. Open http://localhost/phpmyadmin.
3. Create a database named `workermanagementsystem` using `utf8mb4_unicode_ci`.
4. In the `backend` directory, copy `.env.example` to `.env` and review every value.
5. Keep `backend/database.sqlite` untouched. The existing application currently uses SQLite; the new MySQL connection helper is preparatory and does not switch routes automatically.
6. Before migrating, make a separate copy of `backend/database.sqlite`. Run the read-only inventory/export:
   ```bash
   cd backend
   node scripts/export-sqlite-for-migration.js
   ```
7. Review the JSON export and table/column definitions, then implement and verify the MySQL schema migration before changing the active database adapter.
8. Never commit `.env`, database exports, or real employee data.

## Current status

- `config/mysql.js` provides a lazy MySQL connection pool and connection test.
- `scripts/export-sqlite-for-migration.js` reads SQLite in read-only mode and writes a timestamped JSON backup under `migration-backups/`.
- This stage intentionally does not write to MySQL or change the app's active database. The existing routes contain schema/SQL differences that must be reconciled before a safe cutover.
