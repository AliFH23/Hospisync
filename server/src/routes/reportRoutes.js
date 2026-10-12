import { Router } from 'express';
import { getWasteReport } from '../controllers/reportController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/enums.js';

const router = Router();

router.use(protect, authorize(ROLES.PHARMACIST, ROLES.ADMIN));

router.get('/waste', getWasteReport);

export default router;