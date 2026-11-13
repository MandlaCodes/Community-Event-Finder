
const BASE = (
  process.env.EXPO_PUBLIC_COMMUNITY_API_URL || ''
)
  .trim()
  .replace(/\/+$/, '');

export function apiImage(image) {
  if (!image) return null;

  let value = image;

  if (Array.isArray(value)) {
    value = [...value]
      .filter(Boolean)
      .sort(
        (a, b) =>
          (Number(b?.width) || 0) -
          (Number(a?.width) || 0)
      )[0];
  }

  if (typeof value === 'object') {
    value =
      value.url ||
      value.uri ||
      value.src ||
      null;
  }

  if (typeof value !== 'string') return null;

  const url = value.trim();

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith('/api/')) {
    return BASE ? `${BASE}${url}` : null;
  }

  return null;
}

async function request(path, options = {}) {
  if (!BASE) {
    throw new Error(
      'Set EXPO_PUBLIC_COMMUNITY_API_URL in your Expo .env'
    );
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    22000
  );

  try {
    const response = await fetch(
      `${BASE}${path}`,
      {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      }
    );

    if (!response.ok) {
      let message = `Request failed (${response.status})`;

      try {
        const error = await response.json();

        message =
          typeof error.detail === 'string'
            ? error.detail
            : message;
      } catch {
        // Preserve HTTP error.
      }

      throw new Error(message);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Request timed out. Please try again.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const q = (value) =>
  encodeURIComponent(String(value ?? ''));

export const getEvents = ({
  city,
  country = '',
  category = 'all',
  keyword = '',
  pages = 5,
}) => {
  const safePages = Math.max(
    1,
    Math.min(8, Number(pages) || 5)
  );

  return request(
    `/api/events?city=${q(city)}` +
      `&country=${q(country)}` +
      `&category=${q(category)}` +
      `&keyword=${q(keyword.trim())}` +
      `&pages=${safePages}`
  );
};

export const getPlaces = ({
  city,
  country = '',
  category = 'restaurants',
}) =>
  request(
    `/api/places?city=${q(city)}` +
      `&country=${q(country)}` +
      `&category=${q(category)}`
  );

export const askCommunity = ({
  message,
  city,
  country = '',
  candidates = [],
}) =>
  request('/api/concierge', {
    method: 'POST',
    body: JSON.stringify({
      message,
      city,
      country,
      candidates,
    }),
  });
