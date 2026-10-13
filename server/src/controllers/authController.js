import bcrypt from 'bcryptjs';
import { User, Hospital } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { logAudit } from '../utils/audit.js';

// Compared against when the email doesn't exist, so both cases take the same time.
// Without it, a fast "no" would reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 12);

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = req.body ?? {};

  // Strings only: blocks NoSQL injection like { "email": { "$gt": "" } }
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw AppError.badRequest('Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  let passwordOk = false;
  if (user) passwordOk = await user.comparePassword(password);
  else await bcrypt.compare(password, DUMMY_HASH);

  if (!user || !passwordOk) {
    if (user) {
      await logAudit({
        req, hospital: user.hospital, actor: user,
        action: 'LOGIN_FAILED', entityType: 'User', entityId: user._id,
      });
    }
    // Same message for both cases: never reveal whether the email exists
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) throw AppError.forbidden('This account has been deactivated');

  const hospital = await Hospital.findById(user.hospital).select('name code isActive');
  if (!hospital?.isActive) throw AppError.forbidden('This hospital is not active on Hospisync');

  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await logAudit({
    req, hospital: user.hospital, actor: user,
    action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user._id,
  });

  res.json({
    success: true,
    token: signToken(user),
    user: {
      ...user.toJSON(), // password is stripped by the schema's toJSON
      hospital: { _id: hospital._id, name: hospital.name, code: hospital.code },
    },
  });
}

// GET /api/auth/me — who am I? (used by the frontend after a page refresh)
export async function getMe(req, res) {
  const hospital = await Hospital.findById(req.user.hospital).select('name code departments').lean();
  const department = hospital?.departments.find((d) => String(d._id) === String(req.user.department));

  res.json({
    success: true,
    user: {
      ...req.user,
      hospital: hospital && {
        _id: hospital._id, name: hospital.name, code: hospital.code,
        // Staff filter orders by ward; nurses only ever see their own
        ...(req.user.role !== 'nurse' && {
          departments: hospital.departments.filter((d) => d.isActive !== false).map((d) => ({ _id: d._id, name: d.name, code: d.code })),
        }),
      },
      department: department ? { _id: department._id, name: department.name, code: department.code } : null,
    },
  });
}