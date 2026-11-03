const SESSION_COOKIE = 'jdc_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PASSWORD_ITERATIONS = 100_000;
const services = new Set([
  'Ghusl',
  'Burial Slot',
  'Transport Service',
  'Graveyard Booking',
  'Mayat',
  'Kafan',
  'Cold Storage'
]);

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });

const validText = (value, maxLength) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;

const toHex = (bytes) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex) => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Invalid hexadecimal data.');
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => parseInt(byte, 16));
};

const base64UrlEncode = (bytes) => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64UrlDecode = (value) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  );
  return `pbkdf2$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
};

const verifyPassword = async (password, storedHash) => {
  const [algorithm, iterationsText, saltHex, hashHex] = String(storedHash || '').split('$');
  const iterations = Number(iterationsText);
  if (algorithm !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 ||
      iterations > 1_000_000 || !saltHex || !hashHex) return false;

  const expected = fromHex(hashHex);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key,
    expected.length * 8
  ));
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
};

const getSigningKey = async (env) => {
  if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) {
    throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

const createSession = async (env, userId) => {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    userId,
    expiresAt
  })));
  const key = await getSigningKey(env);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const token = `${payload}.${base64UrlEncode(signature)}`;
  const tokenHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(Math.floor(Date.now() / 1000)),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(tokenHash, userId, expiresAt)
  ]);
  return token;
};

const readSession = async (request, env) => {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;

  let session;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const key = await getSigningKey(env);
    const verified = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(payload)
    );
    if (!verified) return null;
    session = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!Number.isSafeInteger(session.userId) || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Set SESSION_SECRET')) throw error;
    return null;
  }

  const tokenHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return env.DB.prepare(
    `SELECT users.id, users.name, users.email, users.phone, users.role, users.status
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.user_id = ? AND sessions.expires_at = ?
       AND sessions.expires_at > ?`
  ).bind(tokenHash, session.userId, session.expiresAt, Math.floor(Date.now() / 1000)).first();
};

const revokeSession = async (request, env) => {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return;
  const tokenHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
};

const sessionCookie = (token, maxAge = SESSION_TTL_SECONDS) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

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
  createdAt: request.created_at
});

const parseBody = async (request) => {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 32 * 1024) return { error: 'Request body is too large.' };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32 * 1024) {
    return { error: 'Request body is too large.' };
  }
  try {
    const body = JSON.parse(text || '{}');
    return body && typeof body === 'object' && !Array.isArray(body)
      ? { body }
      : { error: 'A JSON object is required.' };
  } catch {
    return { error: 'The request body must be valid JSON.' };
  }
};

const ensureInitialAdmin = async (env) => {
  if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD) return;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to create the initial Head Admin.');
  }
  if (env.ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
  }

  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (count !== 0) return;
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'head-admin', 'Approved')`
  ).bind(env.ADMIN_NAME || 'JDC Head Admin', email, env.ADMIN_PHONE || '', passwordHash).run();
};

const getData = async (env, user) => {
  const isAdmin = ['admin', 'head-admin'].includes(user.role);
  const isHeadAdmin = user.role === 'head-admin';
  const bookingColumns = `id, user_id AS userId, user_email AS userEmail, name, phone, service,
    cause_of_death AS causeOfDeath, city, cold_storage_duration AS coldStorageDuration,
    cold_storage_unit AS coldStorageUnit, details, address, status, created_at AS createdAt`;
  const [usersResult, bookingsResult, notificationsResult, adminRequestsResult] = await Promise.all([
    isHeadAdmin
      ? env.DB.prepare('SELECT id, name, email, phone, role, status FROM users ORDER BY id').all()
      : Promise.resolve({ results: [] }),
    isAdmin
      ? env.DB.prepare(`SELECT ${bookingColumns} FROM bookings ORDER BY id DESC`).all()
      : env.DB.prepare(`SELECT ${bookingColumns} FROM bookings WHERE user_id = ? ORDER BY id DESC`)
        .bind(user.id).all(),
    env.DB.prepare('SELECT id, user_id AS userId, text, read FROM notifications WHERE user_id = ? ORDER BY id DESC')
      .bind(user.id).all(),
    isHeadAdmin
      ? env.DB.prepare('SELECT id, name, email, phone, status, created_at FROM admin_requests ORDER BY id DESC').all()
      : Promise.resolve({ results: [] })
  ]);
  return {
    users: usersResult.results,
    bookings: bookingsResult.results,
    notifications: notificationsResult.results.map((item) => ({ ...item, read: Boolean(item.read) })),
    adminRequests: adminRequestsResult.results.map(publicAdminRequest)
  };
};

const requireRole = (user, roles) =>
  user && roles.includes(user.role)
    ? null
    : json({ message: user ? 'You do not have permission to perform this action.' : 'Please log in to continue.' }, user ? 403 : 401);

const handleApi = async (request, env) => {
  if (!env.DB) return json({ message: 'Cloudflare D1 binding "DB" is not configured.' }, 500);
  await ensureInitialAdmin(env);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'GET, POST, PATCH, DELETE, OPTIONS' } });
  }
  if (path === '/api/auth/session' && method === 'GET') {
    const user = await readSession(request, env);
    return json({ user: user ? publicUser(user) : null });
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) &&
      request.headers.get('X-Requested-With') !== 'XMLHttpRequest') {
    return json({ message: 'Request could not be verified.' }, 403);
  }

  const bodyResult = ['POST', 'PATCH', 'PUT'].includes(method) ? await parseBody(request) : { body: {} };
  if (bodyResult.error) return json({ message: bodyResult.error }, 400);
  const body = bodyResult.body;

  if (path === '/api/auth/register' && method === 'POST') {
    const { name, email, phone, password, role = 'user' } = body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!validText(name, 100) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        !validText(phone, 40) || typeof password !== 'string' || password.length < 12 ||
        password.length > 256 || !['user', 'admin'].includes(role)) {
      return json({
        message: 'Enter a valid name, email, phone number, and password of at least 12 characters.'
      }, 400);
    }

    const duplicate = await env.DB.prepare(
      `SELECT email FROM users WHERE email = ?
       UNION ALL SELECT email FROM admin_requests WHERE email = ? AND status = 'Pending' LIMIT 1`
    ).bind(normalizedEmail, normalizedEmail).first();
    if (duplicate) return json({ message: 'This email is already registered.' }, 409);

    const passwordHash = await hashPassword(password);
    if (role === 'admin') {
      const result = await env.DB.prepare(
        `INSERT INTO admin_requests (name, email, phone, password_hash, status, created_at)
         VALUES (?, ?, ?, ?, 'Pending', ?)`
      ).bind(name.trim(), normalizedEmail, phone.trim(), passwordHash, new Date().toISOString().slice(0, 10)).run();
      if (!result.success) throw new Error('Failed to store the admin registration request.');
      return json({
        message: 'Admin registration request submitted. It is pending Head Admin approval.'
      }, 201);
    }

    let result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO users (name, email, phone, password_hash, role, status)
         VALUES (?, ?, ?, ?, 'user', 'Approved')`
      ).bind(name.trim(), normalizedEmail, phone.trim(), passwordHash).run();
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) {
        return json({ message: 'This email is already registered.' }, 409);
      }
      throw error;
    }
    const user = {
      id: Number(result.meta.last_row_id),
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      role: 'user',
      status: 'Approved'
    };
    const token = await createSession(env, user.id);
    return json({ user }, 201, { 'Set-Cookie': sessionCookie(token) });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const { email, password, role } = body;
    if (typeof email !== 'string' || typeof password !== 'string' || !['user', 'admin'].includes(role)) {
      return json({ message: 'Enter a valid email, password, and account type.' }, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = await env.DB.prepare(
      `SELECT id, name, email, phone, password_hash, role, status FROM users
       WHERE email = ? AND ${role === 'admin' ? "role IN ('admin', 'head-admin')" : "role = 'user'"}`
    ).bind(normalizedEmail).first();
    if (!user || !await verifyPassword(password, user.password_hash)) {
      return json({ message: 'Invalid login credentials.' }, 401);
    }
    const token = await createSession(env, user.id);
    return json({ user: publicUser(user) }, 200, { 'Set-Cookie': sessionCookie(token) });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    await revokeSession(request, env);
    return json({ message: 'Logged out.' }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  const user = await readSession(request, env);
  if (path === '/api/data' && method === 'GET') {
    const denial = requireRole(user, ['user', 'admin', 'head-admin']);
    return denial || json(await getData(env, user));
  }

  if (path === '/api/bookings' && method === 'POST') {
    const denial = requireRole(user, ['user']);
    if (denial) return denial;
    const { name, phone, service, causeOfDeath, city, coldStorageDuration, coldStorageUnit, details, address } = body;
    if (!validText(name, 100) || !validText(phone, 40) || !services.has(service) ||
        !validText(causeOfDeath, 500) || !validText(city, 100) ||
        !validText(details, 2000) || !validText(address, 500) ||
        (service === 'Cold Storage' &&
          (!/^\d{1,4}$/.test(String(coldStorageDuration)) || !['hours', 'days'].includes(coldStorageUnit)))) {
      return json({ message: 'Please provide valid and complete booking details.' }, 400);
    }
    const booking = {
      userId: user.id,
      userEmail: user.email,
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
    const result = await env.DB.prepare(
      `INSERT INTO bookings
       (user_id, user_email, name, phone, service, cause_of_death, city, cold_storage_duration,
        cold_storage_unit, details, address, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      booking.userId, booking.userEmail, booking.name, booking.phone, booking.service,
      booking.causeOfDeath, booking.city, booking.coldStorageDuration, booking.coldStorageUnit,
      booking.details, booking.address, booking.status, booking.createdAt
    ).run();
    booking.id = Number(result.meta.last_row_id);
    await env.DB.prepare(
      'INSERT INTO notifications (user_id, text, read) VALUES (?, ?, 0)'
    ).bind(user.id, `${booking.service} request submitted and is awaiting review.`).run();
    return json({ booking }, 201);
  }

  const bookingStatusMatch = path.match(/^\/api\/bookings\/(\d+)\/status$/);
  if (bookingStatusMatch && method === 'PATCH') {
    const denial = requireRole(user, ['admin', 'head-admin']);
    if (denial) return denial;
    const id = Number(bookingStatusMatch[1]);
    const booking = await env.DB.prepare('SELECT id, user_id, service, status FROM bookings WHERE id = ?')
      .bind(id).first();
    if (!booking) return json({ message: 'Booking not found.' }, 404);
    if (!['Approved', 'Rejected'].includes(body.status) || booking.status !== 'Pending') {
      return json({ message: 'Only pending bookings can be approved or rejected.' }, 400);
    }
    const results = await env.DB.batch([
      env.DB.prepare("UPDATE bookings SET status = ? WHERE id = ? AND status = 'Pending'").bind(body.status, id),
      env.DB.prepare(
        `INSERT INTO notifications (user_id, text, read)
         SELECT user_id, ?, 0 FROM bookings WHERE id = ? AND status = ?`
      ).bind(`Your ${booking.service} request was ${body.status.toLowerCase()}.`, id, body.status)
    ]);
    if (results[0].meta.changes === 0) {
      return json({ message: 'Only pending bookings can be approved or rejected.' }, 400);
    }
    return json({ message: `Booking ${body.status.toLowerCase()}.` });
  }

  const bookingDeleteMatch = path.match(/^\/api\/bookings\/(\d+)$/);
  if (bookingDeleteMatch && method === 'DELETE') {
    const denial = requireRole(user, ['admin', 'head-admin']);
    if (denial) return denial;
    const id = Number(bookingDeleteMatch[1]);
    const booking = await env.DB.prepare('SELECT id, user_id, service FROM bookings WHERE id = ?')
      .bind(id).first();
    if (!booking) return json({ message: 'Booking not found.' }, 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bookings WHERE id = ?').bind(id),
      env.DB.prepare('DELETE FROM notifications WHERE user_id = ? AND instr(text, ?) > 0')
        .bind(booking.user_id, booking.service)
    ]);
    return json({ message: 'Booking deleted.' });
  }

  const adminRequestMatch = path.match(/^\/api\/admin-requests\/(\d+)(?:\/(approve|reject))?$/);
  if (adminRequestMatch) {
    const denial = requireRole(user, ['head-admin']);
    if (denial) return denial;
    const id = Number(adminRequestMatch[1]);
    const action = adminRequestMatch[2];
    if (method === 'DELETE' && !action) {
      const result = await env.DB.prepare('DELETE FROM admin_requests WHERE id = ?').bind(id).run();
      return result.meta.changes
        ? json({ message: 'Admin request deleted.' })
        : json({ message: 'Admin request not found.' }, 404);
    }
    if (method === 'POST' && action === 'reject') {
      const result = await env.DB.prepare(
        `UPDATE admin_requests SET status = 'Rejected' WHERE id = ? AND status = 'Pending'`
      ).bind(id).run();
      return result.meta.changes
        ? json({ message: 'Admin registration rejected.' })
        : json({ message: 'Pending admin request not found.' }, 404);
    }
    if (method === 'POST' && action === 'approve') {
      const requestRow = await env.DB.prepare(
        `SELECT id, name, email, phone, password_hash FROM admin_requests
         WHERE id = ? AND status = 'Pending'`
      ).bind(id).first();
      if (!requestRow) return json({ message: 'Pending admin request not found.' }, 404);

      const results = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO users (name, email, phone, password_hash, role, status)
           SELECT name, email, phone, password_hash, 'admin', 'Approved'
           FROM admin_requests WHERE id = ? AND status = 'Pending'`
        ).bind(id),
        env.DB.prepare(
          `INSERT INTO notifications (user_id, text, read)
           SELECT id, 'Your admin registration was approved. You can now log in as Admin.', 0
           FROM users WHERE email = ? AND role = 'admin'`
        ).bind(requestRow.email),
        env.DB.prepare('DELETE FROM admin_requests WHERE id = ? AND status = ?').bind(id, 'Pending')
      ]);
      if (results[0].meta.changes === 0) {
        return json({ message: 'Pending admin request not found.' }, 404);
      }
      return json({ message: 'Admin registration approved.' });
    }
  }

  const adminDeleteMatch = path.match(/^\/api\/admins\/(\d+)$/);
  if (adminDeleteMatch && method === 'DELETE') {
    const denial = requireRole(user, ['head-admin']);
    if (denial) return denial;
    const id = Number(adminDeleteMatch[1]);
    if (id === user.id) return json({ message: 'You cannot remove your own account.' }, 400);
    const result = await env.DB.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").bind(id).run();
    return result.meta.changes
      ? json({ message: 'Admin account deleted.' })
      : json({ message: 'Admin account not found.' }, 404);
  }

  return json({ message: 'API route not found.' }, 404);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error('Cloudflare API request failed:', error);
        return json({ message: 'The request could not be completed.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
