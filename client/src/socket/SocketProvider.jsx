import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { tokenStore } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const SocketContext = createContext({ socket: null, connected: false });

/** One Socket.io connection per logged-in session (same origin → Vite proxies /socket.io). */
export function SocketProvider({ children }) {
  const { status, logout } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (status !== 'authed') return undefined;

    const s = io({ auth: { token: tokenStore.get() }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('session:expired', logout);
    s.on('connect_error', (err) => {
      setConnected(false);
      // Token rejected (expired / deactivated) → back to login
      if (/log in|deactivated|no longer exists|changed/i.test(err.message)) logout();
    });
    setSocket(s);

    return () => { s.disconnect(); setSocket(null); setConnected(false); };
  }, [status, logout]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/** Subscribe to a socket event for the lifetime of a component. */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return undefined;
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [socket, event, handler]);
}