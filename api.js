/**
 * api.js — shared API helper for Peak-Forge frontend
 * Include this before any page-specific script.
 */

const API_BASE = '/api';

/** Returns JWT token from localStorage or null */
function getToken() {
  try { return localStorage.getItem('token'); } catch { return null; }
}

/** Returns parsed user object from localStorage or null */
function getLocalUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

/** Redirect to auth page if not logged in */
function requireAuth() {
  if (!getToken()) {
    location.href = '/auth.html';
    return false;
  }
  return true;
}

/** Authenticated fetch wrapper */
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });

  // If 401, token expired → redirect to login
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = '/auth.html';
    return null;
  }

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Require a specific role — redirect with toast if wrong role */
function requireRole(role) {
  const user = getLocalUser();
  if (!user || user.role !== role) {
    alert(
      role === 'coach'
        ? '⚠️ این صفحه مخصوص مربیان است. لطفاً با حساب مربی وارد شوید.'
        : '⚠️ این صفحه مخصوص ورزشکاران است. لطفاً با حساب ورزشکار وارد شوید.'
    );
    location.href = '/auth.html';
    return false;
  }
  return true;
}

/** Log out: clear storage and redirect */
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('role');
  location.href = '/auth.html';
}
