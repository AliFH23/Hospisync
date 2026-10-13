import { User, Hospital } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { logAudit } from '../utils/audit.js';
import { ROLES, WARD_ROLES } from '../constants/enums.js';

const PUBLIC_FIELDS = 'fullName email role employeeId department isActive lastLoginAt createdAt';
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

// GET /api/users — admin only. Lists users of the admin's OWN hospital.
// Optional filters: ?role=nurse&active=true
export async function listUsers(req, res) {
  const filter = { hospital: req.user.hospital }; // hospital scoping: never trust the client for this
  if (typeof req.query.role === 'string') filter.role = req.query.role;
  if (req.query.active === 'true' || req.query.active === 'false') filter.isActive = req.query.active === 'true';

  const users = await User.find(filter)
    .select(PUBLIC_FIELDS)
    .sort({ role: 1, fullName: 1 })
    .lean();

  res.json({ success: true, count: users.length, users });
}

// The department must be an active ward of THIS hospital (ids are never trusted blindly)
async function assertDepartment(hospitalId, departmentId) {
  const h = await Hospital.findById(hospitalId).select('departments').lean();
  const dep = h?.departments.find((d) => String(d._id) === String(departmentId));
  if (!dep || dep.isActive === false) throw AppError.badRequest('Department not found in your hospital');
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10 || pw.length > 128) {
    throw AppError.badRequest('Password must be 10-128 characters');
  }
}

/**
 * POST /api/users  (admin)
 * Body: { fullName, email, password, role, employeeId, department? }   department is required for doctors and nurses
 */
export async function createUser(req, res) {
  const b = pick(req.body ?? {}, ['fullName', 'email', 'password', 'role', 'employeeId', 'department']);
  checkPassword(b.password);
  if (!Object.values(ROLES).includes(b.role)) throw AppError.badRequest('Invalid role');
  if (WARD_ROLES.includes(b.role)) await assertDepartment(req.user.hospital, b.department);
  else delete b.department; // only doctors and nurses belong to a ward

  const user = await User.create({ ...b, hospital: req.user.hospital }); // duplicate email / employee ID → 409
  await logAudit({
    req, hospital: req.user.hospital, actor: req.user,
    action: 'USER_CREATED', entityType: 'User', entityId: user._id,
    changes: { after: { email: user.email, role: user.role, employeeId: user.employeeId } },
  });

  res.status(201).json({ success: true, user: user.toJSON() });
}

/**
 * PATCH /api/users/:id  (admin)
 * Body (any subset): { fullName, role, department, isActive, password }
 * Changing role or password signs the user out everywhere (their old tokens stop working).
 */
export async function updateUser(req, res) {
  const b = pick(req.body ?? {}, ['fullName', 'role', 'department', 'isActive', 'password']);
  if (!Object.keys(b).length) throw AppError.badRequest('Nothing to update');

  const user = await User.findOne({ _id: req.params.id, hospital: req.user.hospital });
  if (!user) throw AppError.notFound('User not found');

  // An admin can't lock themselves out
  const self = String(user._id) === String(req.user._id);
  if (self && (b.isActive === false || (b.role && b.role !== user.role))) {
    throw AppError.badRequest('You cannot deactivate your own account or change your own role');
  }

  const before = { fullName: user.fullName, role: user.role, department: user.department, isActive: user.isActive };

  if (b.role !== undefined) {
    if (!Object.values(ROLES).includes(b.role)) throw AppError.badRequest('Invalid role');
    user.role = b.role;
  }
  const finalRole = user.role;
  if (WARD_ROLES.includes(finalRole)) {
    if (b.department !== undefined) await assertDepartment(req.user.hospital, b.department);
    if (b.department !== undefined) user.department = b.department;
    if (!user.department) throw AppError.badRequest('Doctors and nurses must belong to a department');
  } else {
    user.department = undefined;
  }
  if (b.fullName !== undefined) user.fullName = b.fullName;
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== 'boolean') throw AppError.badRequest('isActive must be true or false');
    user.isActive = b.isActive;
  }
  if (b.password !== undefined) {
    checkPassword(b.password);
    user.password = b.password; // hashed + passwordChangedAt stamped by the model's pre-save hook
  }

  await user.save();

  const deactivated = before.isActive && user.isActive === false;
  await logAudit({
    req, hospital: req.user.hospital, actor: req.user,
    action: deactivated ? 'USER_DEACTIVATED' : 'USER_UPDATED', entityType: 'User', entityId: user._id,
    changes: {
      before,
      after: {
        fullName: user.fullName, role: user.role, department: user.department, isActive: user.isActive,
        ...(b.password !== undefined && { passwordReset: true }), // never the password itself
      },
    },
  });

  res.json({ success: true, user: user.toJSON() });
}

/**
 * GET /api/users/prescribers  (any logged-in user)
 * Active doctors of the hospital: used by nurses to pick who gave a verbal order.
 * Returns names and wards only, never emails or other account details.
 */
export async function listPrescribers(req, res) {
  const [doctors, hospital] = await Promise.all([
    User.find({ hospital: req.user.hospital, role: ROLES.DOCTOR, isActive: true }).select('fullName department').sort({ fullName: 1 }).lean(),
    Hospital.findById(req.user.hospital).select('departments').lean(),
  ]);
  const code = Object.fromEntries((hospital?.departments ?? []).map((d) => [String(d._id), d.code]));
  res.json({
    success: true,
    doctors: doctors.map((d) => ({ _id: d._id, fullName: d.fullName, departmentCode: code[String(d.department)] ?? null })),
  });
}