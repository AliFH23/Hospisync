import { Router } from 'express';
import { listDrugs, getDrug, createDrug, updateDrug, adjustStock } from '../controllers/drugController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/enums.js';

const router = Router();

// Any logged-in user can read their hospital's formulary; each role sees different fields
router.use(protect);

router.get('/', listDrugs);
router.get('/:id', getDrug);

// Formulary changes: admin only. Receiving / counting stock: pharmacist or admin.
router.post('/', authorize(ROLES.ADMIN), createDrug);
router.patch('/:id', authorize(ROLES.ADMIN), updateDrug);
router.post('/:id/stock', authorize(ROLES.PHARMACIST, ROLES.ADMIN), adjustStock);

export default router;