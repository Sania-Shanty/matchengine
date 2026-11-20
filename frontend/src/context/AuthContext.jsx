// Remembers who is logged in, and shares that with every page.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // If a token is saved in the browser, we must check it before showing pages.
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // On first load: is the saved token still valid?
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    api
      .me()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((error) => {
        if (!cancelled && error.status === 401) {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client announces an expired token; log out when it does.
  useEffect(() => {
    window.addEventListener('matchengine:unauthorized', logout);
    return () => window.removeEventListener('matchengine:unauthorized', logout);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, fullName, password) => {
    const data = await api.register(email, fullName, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return context;
}