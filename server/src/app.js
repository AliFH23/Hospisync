import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { apiLimiter, rejectMongoOperators } from './middleware/security.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

// Behind a proxy/load balancer in production (Render, Nginx...) so req.ip is the real client IP
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

// ---- Security ----
app.use(helmet()); // secure HTTP headers, hides "X-Powered-By: Express"
app.use(cors({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), // only our frontend
}));
app.use('/api', apiLimiter);

// ---- Body parsing ----
app.use(express.json({ limit: '1mb' }));
app.use(rejectMongoOperators);

// Quick check that the API and the database are up
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Must stay last
app.use(notFound);
app.use(errorHandler);

export default app;