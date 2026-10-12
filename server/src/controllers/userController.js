import { User } from '../models/index.js';

// GET /api/users — admin only. Lists users of the admin's OWN hospital.
// Optional filters: ?role=nurse&active=true
export async function listUsers(req, res) {
  const filter = { hospital: req.user.hospital }; // hospital scoping: never trust the client for this
  if (typeof req.query.role === 'string') filter.role = req.query.role;
  if (req.query.active === 'true' || req.query.active === 'false') filter.isActive = req.query.active === 'true';

  const users = await User.find(filter)
    .select('fullName email role employeeId department isActive lastLoginAt')
    .sort({ role: 1, fullName: 1 })
    .lean();

  res.json({ success: true, count: users.length, users });
}