// The ONE place that talks to the backend.
// Every request goes to /api/..., which Vite forwards to http://localhost:4000.
//
// The login token lives in sessionStorage, which belongs to ONE browser tab.
// (localStorage is shared by all tabs, so logging in as Bob in a second tab
// used to switch Alice's first tab to Bob's token behind her back.)

const TOKEN_KEY = 'matchengine_token';

// Remove any token the older version saved in localStorage.
try {
  localStorage.removeItem(TOKEN_KEY);
} catch (error) {
  // storage can be blocked; nothing to do
}

export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token) => sessionStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the backend running?');
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    // some replies have no body
  }

  if (!response.ok) {
    const details = data && data.error ? data.error : {};

    // An expired or invalid token: tell the app to log the user out.
    if (response.status === 401 && token && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event('matchengine:unauthorized'));
    }

    throw new ApiError(
      response.status,
      details.code || 'ERROR',
      details.message || 'Something went wrong.'
    );
  }

  return data;
}

export const api = {
  register: (email, fullName, password) =>
    request('POST', '/auth/register', { email, fullName, password }),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),

  market: () => request('GET', '/market'),
  securities: () => request('GET', '/securities'),
  orderBook: (symbol) => request('GET', `/orderbook/${encodeURIComponent(symbol)}`),
  trades: (symbol, limit = 30) =>
    request('GET', `/trades/${encodeURIComponent(symbol)}?limit=${limit}`),

  account: () => request('GET', '/account'),
  holdings: () => request('GET', '/account/holdings'),

  placeOrder: (order) => request('POST', '/orders', order),
  orders: (symbol) =>
    request('GET', `/orders${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`),
};