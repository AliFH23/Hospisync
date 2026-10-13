import { Router } from 'express';
import { listUsers, createUser, updateUser } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/enums.js';

const router = Router();

// Every route in this file needs a logged-in admin
router.use(protect, authorize(ROLES.ADMIN));

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

export default router;