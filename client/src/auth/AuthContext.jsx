import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { tokenStore } from '../api/client';

const AuthContext = createContext(null);

// Where each role lands after login
export const HOME_BY_ROLE = { nurse: '/ward', pharmacist: '/queue', admin: '/stock' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(tokenStore.get() ? 'loading' : 'guest'); // loading | authed | guest

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('guest');
  }, []);

  // Restore the session after a page refresh
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get('/auth/me')
      .then(({ data }) => { setUser(data.user); setStatus('authed'); })
      .catch(logout);
  }, [logout]);

  // Any 401 anywhere in the app → back to login
  useEffect(() => {
    window.addEventListener('hs:unauthorized', logout);
    return () => window.removeEventListener('hs:unauthorized', logout);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    tokenStore.set(data.token);
    const me = await api.get('/auth/me'); // same shape as after a refresh (includes department)
    setUser(me.data.user);
    setStatus('authed');
    return me.data.user;
  }, []);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);