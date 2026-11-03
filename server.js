import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 5000;
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'jdc_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_PREFIX = 'scrypt';
const services = new Set([
  'Ghusl',
  'Burial Slot',
  'Transport Service',
  'Graveyard Booking',
  'Mayat',
  'Kafan',
  'Cold Storage'
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const legacyDataFile = path.join(__dirname, 'data.json');
const dataFile = process.env.MORTUARY_DATA_FILE ||
  path.join(__dirname, '..', 'mortuary-system-data', 'data.json');
const seedDatabase = { users: [], bookings: [], notifications: [], adminRequests: [] };
const sessions = new Map();

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
};

const verifyPassword = async (password, storedHash) => {
  if (typeof storedHash !== 'string') return false;
  const [algorithm, saltHex, keyHex] = storedHash.split('$');
  if (algorithm !== PASSWORD_HASH_PREFIX || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
};

const writeDatabase = (database) => {
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2), { mode: 0o600 });
  try {
    fs.renameSync(temporaryFile, dataFile);
  } catch (error) {
    if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
    throw error;
  }
};

const persistDatabase = (updatedDatabase) => {
  writeDatabase(updatedDatabase);
  database = updatedDatabase;
};

const initializeDatabase = async () => {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  if (!fs.existsSync(dataFile) && fs.existsSync(legacyDataFile)) {
    fs.renameSync(legacyDataFile, dataFile);
  }

  if (!fs.existsSync(dataFile)) {
    const database = { ...seedDatabase };
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      database.users.push({
        id: 1,
        name: process.env.ADMIN_NAME || 'JDC Head Admin',
        email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
        phone: process.env.ADMIN_PHONE || '',
        passwordHash: await hashPassword(process.env.ADMIN_PASSWORD),
        role: 'head-admin',
        status: 'Approved'
      });
    }
    writeDatabase(database);
  }

  const fileData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const database = {
    ...seedDatabase,
    ...fileData,
    users: Array.isArray(fileData.users) ? fileData.users : [],
    bookings: Array.isArray(fileData.bookings) ? fileData.bookings : [],
    notifications: Array.isArray(fileData.notifications) ? fileData.notifications : [],
    adminRequests: Array.isArray(fileData.adminRequests) ? fileData.adminRequests : []
  };

  let migrated = false;
  for (const account of [...database.users, ...database.adminRequests]) {
    if (typeof account.password === 'string') {
      account.passwordHash = await hashPassword(account.password);
      delete account.password;
      migrated = true;
    }
  }
  if (migrated) writeDatabase(database);
  return database;
};

let database = await initializeDatabase();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status
});
const publicAdminRequest = (request) => ({
  id: request.id,
  name: request.name,
  email: request.email,
  phone: request.phone,
  status: request.status,
  createdAt: request.createdAt
});

const setSessionCookie = (res, token) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  );
};

const clearSessionCookie = (res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
};

const getSessionUser = (req) => {
  const cookie = req.headers.cookie || '';
  const token = cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  const user = database.users.find(account => account.id === session.userId);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return user;
};

const requireSession = (req, res, next) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ message: 'Please log in to continue.' });
  req.user = user;
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action.' });
  }
  next();
};

const validText = (value, maxLength) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

const nextId = (items) => items.reduce((largest, item) => Math.max(largest, Number(item.id) || 0), 0) + 1;

app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'Request could not be verified.' });
  }
  next();
});

app.get('/api/auth/session', (req, res) => {
  const user = getSessionUser(req);
  res.json({ user: user ? publicUser(user) : null });
});

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, phone, password, role = 'user' } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!validText(name, 100) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      !validText(phone, 40) || typeof password !== 'string' || password.length < 12 ||
      password.length > 256 || !['user', 'admin'].includes(role)) {
    return res.status(400).json({
      message: 'Enter a valid name, email, phone number, and password of at least 12 characters.'
    });
  }

  const emailExists = database.users.some(user => user.email.toLowerCase() === normalizedEmail) ||
    database.adminRequests.some(request =>
      request.email.toLowerCase() === normalizedEmail && request.status === 'Pending'
    );
  if (emailExists) return res.status(409).json({ message: 'This email is already registered.' });

  const passwordHash = await hashPassword(password);
  if (role === 'admin') {
    const request = {
      id: nextId(database.adminRequests),
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      passwordHash,
      status: 'Pending',
      createdAt: new Date().toISOString().slice(0, 10)
    };
    persistDatabase({
      ...database,
      adminRequests: [...database.adminRequests, request]
    });
    return res.status(201).json({
      message: 'Admin registration request submitted. It is pending Head Admin approval.'
    });
  }

  const user = {
    id: nextId(database.users),
    name: name.trim(),
    email: normalizedEmail,
    phone: phone.trim(),
    passwordHash,
    role: 'user',
    status: 'Approved'
  };
  persistDatabase({
    ...database,
    users: [...database.users, user]
  });

  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password, role } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' ||
      !['user', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Enter a valid email, password, and account type.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = database.users.find(account =>
    account.email.toLowerCase() === normalizedEmail &&
    (role === 'admin' ? ['admin', 'head-admin'].includes(account.role) : account.role === 'user')
  );
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Invalid login credentials.' });
  }

  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  const cookie = req.headers.cookie || '';
  const token = cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ message: 'Logged out.' });
});

app.get('/api/data', requireSession, (req, res) => {
  const isAdmin = ['admin', 'head-admin'].includes(req.user.role);
  const isHeadAdmin = req.user.role === 'head-admin';
  res.json({
    users: isHeadAdmin ? database.users.map(publicUser) : [],
    bookings: isAdmin
      ? database.bookings
      : database.bookings.filter(booking => booking.userId === req.user.id),
    notifications: database.notifications.filter(item => item.userId === req.user.id),
    adminRequests: isHeadAdmin ? database.adminRequests.map(publicAdminRequest) : []
  });
});

app.post('/api/bookings', requireSession, requireRole('user'), (req, res) => {
  const body = req.body || {};
  const { name, phone, service, causeOfDeath, city, coldStorageDuration, coldStorageUnit, details, address } = body;
  if (!validText(name, 100) || !validText(phone, 40) || !services.has(service) ||
      !validText(causeOfDeath, 500) || !validText(city, 100) ||
      !validText(details, 2000) || !validText(address, 500) ||
      (service === 'Cold Storage' &&
        (!/^\d{1,4}$/.test(String(coldStorageDuration)) || !['hours', 'days'].includes(coldStorageUnit)))) {
    return res.status(400).json({ message: 'Please provide valid and complete booking details.' });
  }

  const booking = {
    id: nextId(database.bookings),
    userId: req.user.id,
    userEmail: req.user.email,
    name: name.trim(),
    phone: phone.trim(),
    service,
    causeOfDeath: causeOfDeath.trim(),
    city: city.trim(),
    coldStorageDuration: service === 'Cold Storage' ? String(coldStorageDuration) : '',
    coldStorageUnit: ['hours', 'days'].includes(coldStorageUnit) ? coldStorageUnit : 'hours',
    details: details.trim(),
    address: address.trim(),
    status: 'Pending',
    createdAt: new Date().toISOString().slice(0, 10)
  };
  persistDatabase({
    ...database,
    bookings: [booking, ...database.bookings],
    notifications: [{
      id: nextId(database.notifications),
      userId: req.user.id,
      text: `${booking.service} request submitted and is awaiting review.`,
      read: false
    }, ...database.notifications]
  });
  res.status(201).json({ booking });
});

app.patch('/api/bookings/:id/status', requireSession, requireRole('admin', 'head-admin'), (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const booking = database.bookings.find(item => item.id === id);
  if (!booking) return res.status(404).json({ message: 'Booking not found.' });
  if (!['Approved', 'Rejected'].includes(status) || booking.status !== 'Pending') {
    return res.status(400).json({ message: 'Only pending bookings can be approved or rejected.' });
  }

  persistDatabase({
    ...database,
    bookings: database.bookings.map(item => item.id === id ? { ...item, status } : item),
    notifications: [{
      id: nextId(database.notifications),
      userId: booking.userId,
      text: `Your ${booking.service} request was ${status.toLowerCase()}.`,
      read: false
    }, ...database.notifications]
  });
  res.json({ message: `Booking ${status.toLowerCase()}.` });
});

app.delete('/api/bookings/:id', requireSession, requireRole('admin', 'head-admin'), (req, res) => {
  const id = Number(req.params.id);
  const booking = database.bookings.find(item => item.id === id);
  if (!booking) return res.status(404).json({ message: 'Booking not found.' });
  persistDatabase({
    ...database,
    bookings: database.bookings.filter(item => item.id !== id),
    notifications: database.notifications.filter(item =>
      !(item.userId === booking.userId && item.text.includes(booking.service))
    )
  });
  res.json({ message: 'Booking deleted.' });
});

app.post('/api/admin-requests/:id/approve', requireSession, requireRole('head-admin'), (req, res) => {
  const id = Number(req.params.id);
  const request = database.adminRequests.find(item => item.id === id && item.status === 'Pending');
  if (!request) return res.status(404).json({ message: 'Pending admin request not found.' });

  const user = {
    id: nextId(database.users),
    name: request.name,
    email: request.email,
    phone: request.phone,
    passwordHash: request.passwordHash,
    role: 'admin',
    status: 'Approved'
  };
  persistDatabase({
    ...database,
    users: [...database.users, user],
    notifications: [{
      id: nextId(database.notifications),
      userId: user.id,
      text: 'Your admin registration was approved. You can now log in as Admin.',
      read: false
    }, ...database.notifications],
    adminRequests: database.adminRequests.filter(item => item.id !== id)
  });
  res.json({ message: 'Admin registration approved.' });
});

app.post('/api/admin-requests/:id/reject', requireSession, requireRole('head-admin'), (req, res) => {
  const id = Number(req.params.id);
  const request = database.adminRequests.find(item => item.id === id && item.status === 'Pending');
  if (!request) return res.status(404).json({ message: 'Pending admin request not found.' });
  persistDatabase({
    ...database,
    adminRequests: database.adminRequests.map(item =>
      item.id === id ? { ...item, status: 'Rejected' } : item
    )
  });
  res.json({ message: 'Admin registration rejected.' });
});

app.delete('/api/admin-requests/:id', requireSession, requireRole('head-admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!database.adminRequests.some(item => item.id === id)) {
    return res.status(404).json({ message: 'Admin request not found.' });
  }
  persistDatabase({
    ...database,
    adminRequests: database.adminRequests.filter(item => item.id !== id)
  });
  res.json({ message: 'Admin request deleted.' });
});

app.delete('/api/admins/:id', requireSession, requireRole('head-admin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: 'You cannot remove your own account.' });
  const user = database.users.find(account => account.id === id && account.role === 'admin');
  if (!user) return res.status(404).json({ message: 'Admin account not found.' });
  const updatedDatabase = {
    ...database,
    users: database.users.filter(account => account.id !== id)
  };
  persistDatabase(updatedDatabase);
  for (const [token, session] of sessions) {
    if (session.userId === id) sessions.delete(token);
  }
  res.json({ message: 'Admin account deleted.' });
});

const staticDirectory = path.join(__dirname, 'dist');
app.use(express.static(staticDirectory));
app.get('*', (req, res, next) => {
  res.sendFile(path.join(staticDirectory, 'index.html'), error => {
    if (error) next(error);
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: 'The request could not be completed.' });
});

const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Backend running on http://${host}:${port}`);
});
