import { Router } from 'express';
import { listUsers, createUser, updateUser, listPrescribers } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/enums.js';

const router = Router();

// Any logged-in user: the doctors list for verbal orders (names and wards only)
router.get('/prescribers', protect, listPrescribers);

// Everything below needs a logged-in admin
router.use(protect, authorize(ROLES.ADMIN));

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

export default router;