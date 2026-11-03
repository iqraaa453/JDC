CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'head-admin')),
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Rejected')),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_requests_pending_email
  ON admin_requests (email COLLATE NOCASE)
  WHERE status = 'Pending';

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service TEXT NOT NULL,
  cause_of_death TEXT NOT NULL,
  city TEXT NOT NULL,
  cold_storage_duration TEXT NOT NULL,
  cold_storage_unit TEXT NOT NULL,
  details TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bookings_user_id_id ON bookings (user_id, id DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1))
);

CREATE INDEX IF NOT EXISTS notifications_user_id_id ON notifications (user_id, id DESC);
