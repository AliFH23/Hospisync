import { Router } from 'express';
import { listDrugs, getDrug } from '../controllers/drugController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Any logged-in user can read their hospital's formulary; each role sees different fields
router.use(protect);

router.get('/', listDrugs);
router.get('/:id', getDrug);

export default router;