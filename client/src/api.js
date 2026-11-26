const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const TOKEN_KEY = 'wms_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const signOut = () => localStorage.removeItem(TOKEN_KEY);

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok || payload.success === false) {
    const message = payload.message || payload.errors?.[0]?.msg || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function signIn(username, password) {
  const payload = await apiRequest('/auth/login', { method:'POST', body:JSON.stringify({ username, password }) });
  const data = payload.data || {};
  if (!data.token) throw new Error('Login response did not contain an access token');
  localStorage.setItem(TOKEN_KEY, data.token);
  return data;
}
