import axios from 'axios';

const TOKEN_KEY = 'hs.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

// All calls go to /api (Vite proxies it to the Node server in development)
const api = axios.create({ baseURL: '/api', timeout: 35000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Session expired / account changed → tell the app to log out (except for the login call itself)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('hs:unauthorized'));
    }
    return Promise.reject(err);
  }
);

/** Readable message from an API error (server already sends { message }) */
export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || fallback;

export default api;