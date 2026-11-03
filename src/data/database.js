const API_URL = '/api';

if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('jdc-mortuary-database');
    window.localStorage.removeItem('jdc-mortuary-session');
  } catch (error) {
    console.error('Unable to clear legacy local session data.', error);
  }
}

const request = async (endpoint, { method = 'GET', body } = {}) => {
  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch {
    throw new Error('Cannot reach the backend. Start it from the project folder with "npm run server".');
  }

  const responseText = await response.text();
  let result;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(
        `The backend returned an unreadable response (HTTP ${response.status}). Check that the backend is running with "npm run server".`
      );
    }
  } else {
    const message = [502, 503, 504].includes(response.status)
      ? 'The backend is not running. Start it from the project folder with "npm run server".'
      : `The backend returned an empty response (HTTP ${response.status}).`;
    throw new Error(message);
  }

  if (!response.ok) {
    throw new Error(result.message || `The request failed (HTTP ${response.status}).`);
  }
  return result;
};

export const getSession = async () => {
  const { user } = await request('/auth/session');
  return user;
};

export const getData = () => request('/data');

export const register = (details) =>
  request('/auth/register', { method: 'POST', body: details });

export const login = (credentials) =>
  request('/auth/login', { method: 'POST', body: credentials });

export const logout = () =>
  request('/auth/logout', { method: 'POST', body: {} });

export const createBooking = (booking) =>
  request('/bookings', { method: 'POST', body: booking });

export const updateBookingStatus = (id, status) =>
  request(`/bookings/${id}/status`, { method: 'PATCH', body: { status } });

export const deleteBooking = (id) =>
  request(`/bookings/${id}`, { method: 'DELETE' });

export const approveAdminRequest = (id) =>
  request(`/admin-requests/${id}/approve`, { method: 'POST', body: {} });

export const rejectAdminRequest = (id) =>
  request(`/admin-requests/${id}/reject`, { method: 'POST', body: {} });

export const deleteAdminRequest = (id) =>
  request(`/admin-requests/${id}`, { method: 'DELETE' });

export const deleteAdminAccount = (id) =>
  request(`/admins/${id}`, { method: 'DELETE' });
