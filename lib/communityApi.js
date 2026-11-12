// Set EXPO_PUBLIC_COMMUNITY_API_URL to your deployed HTTPS FastAPI URL.
const BASE = (process.env.EXPO_PUBLIC_COMMUNITY_API_URL || '').replace(/\/$/, '');
export const apiImage = (image) => image?.startsWith('/api/') ? `${BASE}${image}` : image;
async function request(path, options = {}) {
  if (!BASE) throw new Error('Set EXPO_PUBLIC_COMMUNITY_API_URL in your Expo .env');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(`${BASE}${path}`, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!response.ok) { let message = `Request failed (${response.status})`; try { const error = await response.json(); message = error.detail || message; } catch {} throw new Error(message); }
    return response.json();
  } finally { clearTimeout(timer); }
}
const q = (v) => encodeURIComponent(String(v || ''));
export const getEvents = ({ city, country = '', category = 'all', pages = 3 }) => request(`/api/events?city=${q(city)}&country=${q(country)}&category=${q(category)}&pages=${pages}`);
export const getPlaces = ({ city, country = '', category = 'restaurants' }) => request(`/api/places?city=${q(city)}&country=${q(country)}&category=${q(category)}`);
export const askCommunity = ({ message, city, country = '', candidates = [] }) => request('/api/concierge', { method: 'POST', body: JSON.stringify({ message, city, country, candidates }) });
