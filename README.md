# JDC Mortuary System

A React and Vite portal for managing mortuary service requests, user accounts, notifications, and admin approvals.

New customer accounts can register immediately. A person registering through **Register as Admin** is stored as a pending request and cannot log in as an admin until the Head Admin approves it. Approved admins can manage customer bookings; only the Head Admin can manage admin registrations and approved admin accounts.

## Data storage

The project does not use a relational database or a database server. When the Express backend is running, it stores application data as JSON in `mortuary-system-data\data.json`, a private folder next to the project rather than in Vite's public project root. On first startup, an existing root-level `data.json` is moved there and any plaintext passwords in it are hashed. The file contains:

- `users`: portal accounts and roles
- `bookings`: service requests, addresses, cause of death, body location city, cold-storage duration, statuses, and dates
- `notifications`: request updates for each user
- `adminRequests`: pending administrator registrations

The browser does not store account credentials, role information, or a copy of the records. Authentication uses an `HttpOnly` session cookie, and the server keeps session state in memory; restarting the backend signs users out. Existing project data is preserved and migrated on first startup; a fresh installation starts with empty collections.

Passwords are hashed with Node.js `scrypt`. The API authenticates users, checks roles on protected operations, limits customers to their own bookings and notifications, and validates submitted booking fields. JSON-file storage remains a lightweight choice for the project's scope; it is not intended for concurrent multi-server use. Keep `data.json` private, back it up, use HTTPS in deployment, and set `NODE_ENV=production` so the session cookie is marked `Secure`.

For a fresh installation with no existing data file, the file starts with empty collections. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before starting the server to create the initial Head Admin. Use a strong, unique password of at least 12 characters. These variables are only used when the data file is first created.

## Run locally

Start the backend in one terminal:

```bash
npm install
# Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment before first start if bootstrapping a new data file.
npm run server
```

Start the frontend in a second terminal:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Deploy the full app on Cloudflare

The Cloudflare Worker in `worker.js` serves the Vite build and handles the API.
It stores accounts, bookings, notifications, and admin requests in D1. The
Express/JSON-file backend remains available for local development; it is not the
backend deployed to Cloudflare.

1. Push the repository to GitHub and create a D1 database named
   `mortuary-system` in the Cloudflare dashboard (or run
   `npx wrangler d1 create mortuary-system`).
2. Copy its database ID into `database_id` in `wrangler.jsonc`, replacing the
   all-zero placeholder, then commit and push that change.
3. In the project root, install dependencies and apply the schema to D1:

   ```bash
   npm ci
   npx wrangler d1 migrations apply mortuary-system --remote
   ```

4. Connect the GitHub repository under **Cloudflare Workers & Pages**, using
   `npm run build` as the build command and `npx wrangler deploy` as the deploy
   command. The repository root is the project root.
5. In the Worker settings, add `ADMIN_EMAIL` and `ADMIN_NAME` as variables;
   add `ADMIN_PASSWORD` and `SESSION_SECRET` as secrets. The password must be
   at least 12 characters. Generate a unique session secret of at least 32
   characters. These admin values create the initial Head Admin when the D1
   users table is empty; changing them later does not change an existing account.
6. Deploy, then test customer registration, login, booking, and admin actions.

The frontend and API share the Worker URL, so no separate API URL or CORS
setting is needed. The existing local JSON data is not automatically copied to
D1; existing accounts and records need to be migrated separately. Back up
important records before changing hosting.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
