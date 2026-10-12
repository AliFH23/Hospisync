import { Router } from 'express';
import { createOrder, getQueue, listOrders, getOrder, updateOrderStatus } from '../controllers/orderController.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { ROLES } from '../constants/enums.js';

const router = Router();

router.use(protect);

router.get('/queue', authorize(ROLES.PHARMACIST, ROLES.ADMIN), getQueue); // must be before /:id
router.get('/', listOrders);
router.get('/:id', getOrder);
router.post('/', authorize(ROLES.NURSE), createOrder);
router.patch('/:id/status', updateOrderStatus); // role rules live in the state machine

export default router;