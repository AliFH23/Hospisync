import { Server } from 'socket.io';
import { authenticateToken } from '../middleware/auth.js';
import { ROLES } from '../constants/enums.js';

let io = null;

// ---- Room names (one place, so emitters and joiners always agree) ----
export const rooms = {
  pharmacy: (hospitalId) => `hospital:${hospitalId}:pharmacy`, // pharmacists + admins
  department: (departmentId) => `department:${departmentId}`,  // nurses of one ward
  user: (userId) => `user:${userId}`,                          // one person, all their tabs
};

/**
 * Attaches Socket.io to the HTTP server.
 * Client connects with: io(URL, { auth: { token } })
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',') },
  });

  // Authenticate every connection with the same logic as HTTP requests
  io.use(async (socket, next) => {
    try {
      const { user, payload } = await authenticateToken(socket.handshake.auth?.token);
      socket.data.user = user;
      socket.data.tokenExp = payload.exp;
      next();
    } catch (err) {
      next(new Error(err.statusCode ? err.message : 'Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { user, tokenExp } = socket.data;

    // Server decides the rooms from the verified account: clients cannot pick rooms
    socket.join(rooms.user(user._id));
    if (user.role === ROLES.NURSE && user.department) socket.join(rooms.department(user.department));
    if (user.role === ROLES.PHARMACIST || user.role === ROLES.ADMIN) socket.join(rooms.pharmacy(user.hospital));

    // Disconnect when the JWT expires, so a socket can't outlive its session
    const msLeft = tokenExp * 1000 - Date.now();
    const timer = setTimeout(() => {
      socket.emit('session:expired');
      socket.disconnect(true);
    }, Math.max(msLeft, 0));
    socket.on('disconnect', () => clearTimeout(timer));

    socket.emit('connected', { userId: user._id, role: user.role });
  });

  return io;
}

export const getIO = () => io;