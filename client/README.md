# Workforce Management Client

React + Vite frontend for the Worker Management System.

## Requirements
- Node.js 18 or newer
- The existing backend running at http://localhost:3000

## Run locally
Open a terminal in this folder:

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## API connection
The Vite development server proxies `/api` requests to `http://localhost:3000`.
To use another backend URL, set `VITE_API_PROXY` before starting Vite.

For a deployed frontend, set `VITE_API_URL` to the backend origin, for example
`https://api.example.com`, and configure the backend's `FRONTEND_URL` and CORS settings.

## Current screens
- Login using the existing `POST /api/auth/login` endpoint
- Overview using `GET /api/auth/me` and `GET /api/dashboard`
- Worker list, search, status filter and create-worker form
- Department, attendance, salary and reports summaries
- Theme preference (saved in this browser)

## Notes
- The frontend does not change or migrate the backend database.
- Worker creation uses the existing protected `POST /api/workers` endpoint. The signed-in account must have the required role.
- The current backend database adapter initializes SQLite. Keep the SQLite database unchanged while MySQL migration work is completed separately.
- Some existing dashboard SQL uses MySQL-specific date functions while the active adapter is SQLite. If the dashboard endpoint reports a SQL error, the backend query compatibility needs to be fixed before live dashboard metrics can load.
