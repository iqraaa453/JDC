# JDC Mortuary System

A React and Vite portal for managing mortuary service requests, user accounts, notifications, and admin approvals.

## Demo accounts

- Admin: `admin@jdc.com` / `admin123`
- User: `ahmed@example.com` / `pass123`
- User: `sana@example.com` / `pass123`

The current sample data includes a **Head Admin** and customer accounts. These credentials are for local demonstration only; change or remove them before deployment. Existing plaintext passwords are automatically converted to salted password hashes when the backend starts. New customer accounts can register immediately. A person registering through **Register as Admin** is stored as a pending request and cannot log in as an admin until the Head Admin approves it. Approved admins can manage customer bookings; only the Head Admin can manage admin registrations and approved admin accounts.

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

## Deploy on Render

This is a Node.js application, so Render installs its dependencies from
`package.json` and `package-lock.json`; it does not need a Python
`requirements.txt`. The root `render.yaml` configures a single web service that
builds the Vite frontend and runs it with the Express backend.

In Render, create a new Blueprint from this repository. Before the first deploy,
set `ADMIN_EMAIL` and `ADMIN_PASSWORD` as service environment variables to
create the initial Head Admin. Use a unique password of at least 12 characters.

The app stores records in a JSON file. Render's default filesystem is ephemeral,
so data can be lost when the service is redeployed or restarted. For persistent
records, attach a persistent disk and set `MORTUARY_DATA_FILE` to a file path on
its mount point, such as `/var/data/data.json`.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
