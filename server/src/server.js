import 'dotenv/config';
import http from 'node:http';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket } from './socket/index.js';
import { startExpiryWatcher } from './jobs/expiryWatcher.js';
import './models/index.js'; // registers all models so Mongoose builds their indexes

const PORT = process.env.PORT || 5000;

try {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is missing or too short (min 32 characters) in .env');
  }
  await connectDB();

  // Express and Socket.io share one HTTP server (same port)
  const server = http.createServer(app);
  initSocket(server);
  startExpiryWatcher();
  server.listen(PORT, () => console.log(`Hospisync API + realtime running on http://localhost:${PORT}`));
} catch (err) {
  console.error('Failed to start server:', err.message);
  process.exit(1);
}

// Last-resort safety nets: log and exit so the process manager restarts cleanly
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});