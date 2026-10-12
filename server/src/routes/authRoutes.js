import { Router } from 'express';
import { login, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/security.js';

const router = Router();

router.post('/login', loginLimiter, login);
router.get('/me', protect, getMe);

export default router;