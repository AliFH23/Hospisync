import { Router } from 'express';
import { forecast, stock } from '../controllers/aiController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/enums.js';

const router = Router();

router.use(protect, authorize(ROLES.PHARMACIST, ROLES.ADMIN));

router.get('/forecast', forecast);
router.get('/stock', stock);

export default router;
