import { Router } from 'express';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/index.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ notifications: items, unread: items.filter((n) => !n.read).length });
});

router.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
});

export default router;
