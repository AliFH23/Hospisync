import mongoose from 'mongoose';
import { Order, Drug, Hospital } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { logAudit } from '../utils/audit.js';
import { ORDER_STATUS } from '../constants/enums.js';
import { EVENTS, emitOrderEvent, emitLowStock } from '../socket/events.js';

const ACTIVE_STATUSES = [ORDER_STATUS.PENDING, ORDER_STATUS.PREPARING, ORDER_STATUS.READY];

// Copies only the listed keys. The client can never set status, requestedBy, hospital, etc.
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

/**
 * POST /api/orders  (nurse)
 * Body:
 * {
 *   drugId, route, priority, requiredBy, notes?, infusionDurationMin?,
 *   patient: { mrn, name, weightKg?, heightCm?, allergies?[] },
 *   dose: { prescribedValue, basis?, unit? },   // basis/unit default to the drug's
 *   diluent?: { name, volumeMl },
 *   confirmDuplicate?: true                      // override the duplicate-order guard
 * }
 */
export async function createOrder(req, res) {
  const body = req.body ?? {};
  const nurse = req.user;

  if (!body.drugId) throw AppError.badRequest('drugId is required');
  if (!body.patient || typeof body.patient !== 'object') throw AppError.badRequest('patient is required');
  if (!body.dose || typeof body.dose !== 'object') throw AppError.badRequest('dose is required');

  // 1) Ward comes from the nurse's account, never from the request
  const hospital = await Hospital.findById(nurse.hospital).select('departments').lean();
  const department = hospital?.departments.find((d) => String(d._id) === String(nurse.department));
  if (!department?.isActive) throw AppError.forbidden('Your account is not linked to an active department');

  // 2) Drug must exist, be active, and belong to this hospital
  const drug = await Drug.findOne({ _id: body.drugId, hospital: nurse.hospital, isActive: true }).lean();
  if (!drug) throw AppError.notFound('Drug not found in your hospital formulary');

  // 3) Route must be allowed for this drug
  if (!drug.allowedRoutes.includes(body.route)) {
    throw AppError.badRequest(`Route "${body.route}" is not allowed for ${drug.name}. Allowed: ${drug.allowedRoutes.join(', ')}`);
  }

  // 4) Dosing basis and unit must match the formulary (e.g. no mg/kg for a mg/m² drug)
  const basis = body.dose.basis ?? drug.dosing.basis;
  const unit = body.dose.unit ?? drug.dosing.unit;
  if (basis !== drug.dosing.basis || unit !== drug.dosing.unit) {
    throw AppError.badRequest(
      `${drug.name} is dosed as ${drug.dosing.unit} (${drug.dosing.basis}-based). Got ${unit} (${basis}-based).`
    );
  }

  // 5) Allergy check against the drug name
  const patient = pick(body.patient, ['mrn', 'name', 'weightKg', 'heightCm', 'allergies']);
  const drugNames = [drug.name, drug.genericName].filter(Boolean).map((n) => n.toLowerCase());
  const allergy = (patient.allergies || []).find((a) =>
    drugNames.some((n) => n.includes(String(a).toLowerCase().trim()) && String(a).trim().length >= 3)
  );
  if (allergy) throw new AppError(`Patient has a recorded allergy: "${allergy}". Order blocked.`, 422);

  // Build the order (only whitelisted fields)
  const order = new Order({
    hospital: nurse.hospital,
    department: department._id,
    departmentCode: department.code,
    patient,
    drug: drug._id,
    drugSnapshot: {
      name: drug.name,
      category: drug.category,
      beyondUseHours: drug.stability.beyondUseHours,
      unitCost: drug.unitCost?.amount ?? 0,
    },
    dose: { prescribedValue: body.dose.prescribedValue, basis, unit },
    route: body.route,
    diluent: pick(body.diluent, ['name', 'volumeMl']),
    infusionDurationMin: body.infusionDurationMin,
    priority: body.priority,
    requiredBy: body.requiredBy,
    notes: body.notes,
    requestedBy: nurse._id,
  });

  // Runs schema validation + computes BSA and the final dose
  await order.validate();

  // 6) Final dose must not exceed the drug's single-dose ceiling
  const max = drug.dosing.maxSingleDose;
  if (max != null && order.dose.calculatedValue > max) {
    throw new AppError(
      `Calculated dose ${order.dose.calculatedValue} ${unit} exceeds the maximum single dose (${max} ${unit}) for ${drug.name}.`,
      422
    );
  }

  // 7) Duplicate guard: same patient + same drug already in progress
  if (!body.confirmDuplicate) {
    const dup = await Order.findOne({
      hospital: nurse.hospital,
      'patient.mrn': order.patient.mrn,
      drug: drug._id,
      status: { $in: ACTIVE_STATUSES },
    }).select('orderNumber status').lean();
    if (dup) {
      throw new AppError(
        `Possible duplicate: order ${dup.orderNumber} for this patient and drug is already ${dup.status}. ` +
          'Resend with "confirmDuplicate": true if this is intended.',
        409
      );
    }
  }

  // 8) Save order + audit entry atomically: both are written, or neither
  await mongoose.connection.transaction(async (session) => {
    await order.save({ session });
    await logAudit({
      req, session,
      hospital: nurse.hospital, actor: nurse,
      action: 'ORDER_CREATED', entityType: 'Order', entityId: order._id,
      changes: {
        after: {
          orderNumber: order.orderNumber, drug: drug.name, priority: order.priority,
          dose: `${order.dose.calculatedValue} ${unit}`, mrn: order.patient.mrn,
        },
      },
    });
  });

  // Broadcast only after the transaction committed
  const created = withTimeFlags(order.toObject());
  emitOrderEvent(EVENTS.ORDER_CREATED, created);

  res.status(201).json({ success: true, order: created });
}

// =====================================================================
// Reading orders
// =====================================================================

const ALL_STATUSES = Object.values(ORDER_STATUS);
// History only on the detail endpoint. __v is kept: clients send it back as "version" when changing status.
const LIST_FIELDS = '-statusHistory';

// Adds time-based flags the dashboards need (computed now, not stored)
function withTimeFlags(o, now = Date.now()) {
  const active = ACTIVE_STATUSES.includes(o.status);
  const msToDeadline = new Date(o.requiredBy).getTime() - now;
  const msToExpiry = o.expiresAt ? new Date(o.expiresAt).getTime() - now : null;
  return {
    ...o,
    minutesToDeadline: active ? Math.round(msToDeadline / 60000) : null,
    isOverdue: active && msToDeadline < 0,
    minutesToExpiry: o.status === ORDER_STATUS.READY && msToExpiry != null ? Math.round(msToExpiry / 60000) : null,
    isExpired: o.status === ORDER_STATUS.READY && msToExpiry != null && msToExpiry <= 0,
    expiringSoon: o.status === ORDER_STATUS.READY && msToExpiry != null && msToExpiry > 0 && msToExpiry <= 60 * 60000,
  };
}

// "pending,ready" or "active" → validated array of statuses
function parseStatuses(raw) {
  if (raw === undefined) return null;
  if (raw === 'active') return ACTIVE_STATUSES;
  const list = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((s) => !ALL_STATUSES.includes(s));
  if (bad.length || !list.length) {
    throw AppError.badRequest(`Invalid status: ${bad.join(', ') || raw}. Use: active, ${ALL_STATUSES.join(', ')}`);
  }
  return list;
}

function parseDate(raw, name) {
  if (raw === undefined) return undefined;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw AppError.badRequest(`"${name}" is not a valid date`);
  return d;
}

/**
 * Base filter every read uses: always this hospital, and nurses only see their own ward.
 */
function scopeFor(user) {
  const filter = { hospital: user.hospital };
  if (user.role === 'nurse') filter.department = user.department;
  return filter;
}

/**
 * GET /api/orders/queue  (pharmacist, admin)
 * The pharmacist work queue: active orders, emergency first, then earliest deadline.
 * Optional: ?status=pending (or preparing / ready)
 */
export async function getQueue(req, res) {
  const statuses = parseStatuses(req.query.status) ?? ACTIVE_STATUSES;
  if (statuses.some((s) => !ACTIVE_STATUSES.includes(s))) {
    throw AppError.badRequest('The queue only contains active statuses: pending, preparing, ready');
  }

  const orders = await Order.find({ ...scopeFor(req.user), status: { $in: statuses } })
    .select(LIST_FIELDS)
    .sort({ priorityRank: 1, requiredBy: 1 })
    .limit(500)
    .lean();

  const now = Date.now();
  const items = orders.map((o) => withTimeFlags(o, now));
  const counts = Object.fromEntries(ACTIVE_STATUSES.map((s) => [s, 0]));
  for (const o of items) counts[o.status] += 1;

  res.json({
    success: true,
    counts,
    overdue: items.filter((o) => o.isOverdue).length,
    expiringSoon: items.filter((o) => o.expiringSoon).length,
    orders: items,
  });
}

/**
 * GET /api/orders
 * Nurses: their ward only. Pharmacists/admins: whole hospital.
 * Query (all optional):
 *   status      active | pending,ready,...
 *   department  department _id (pharmacist/admin only)
 *   mrn         exact patient MRN
 *   q           search box: exact MRN or part of the order number
 *   priority    emergency | urgent | routine
 *   from, to    createdAt range (ISO dates)
 *   page, limit pagination (limit max 100, default 20)
 */
export async function listOrders(req, res) {
  const { status, department, mrn, priority, from, to, q } = req.query;
  const filter = scopeFor(req.user);

  const statuses = parseStatuses(status);
  if (statuses) filter.status = { $in: statuses };

  if (department !== undefined) {
    if (req.user.role === 'nurse') throw AppError.forbidden('Nurses can only view their own department');
    filter.department = department; // invalid ObjectId → CastError → 400
  }
  if (mrn !== undefined) filter['patient.mrn'] = String(mrn).trim().toUpperCase();
  if (q !== undefined) {
    const term = String(q).trim().toUpperCase();
    if (term.length < 2 || term.length > 40) throw AppError.badRequest('Search must be 2-40 characters');
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // matched literally, never as a regex
    filter.$or = [{ 'patient.mrn': term }, { orderNumber: { $regex: escaped } }];
  }
  if (priority !== undefined) {
    if (!['emergency', 'urgent', 'routine'].includes(priority)) throw AppError.badRequest('Invalid priority');
    filter.priority = priority;
  }

  const fromDate = parseDate(from, 'from');
  const toDate = parseDate(to, 'to');
  if (fromDate || toDate) filter.createdAt = { ...(fromDate && { $gte: fromDate }), ...(toDate && { $lte: toDate }) };

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const [orders, total] = await Promise.all([
    Order.find(filter).select(LIST_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  const now = Date.now();
  res.json({
    success: true,
    page, limit, total, pages: Math.ceil(total / limit),
    orders: orders.map((o) => withTimeFlags(o, now)),
  });
}

/**
 * GET /api/orders/:id
 * Full order with status history and the people involved.
 */
export async function getOrder(req, res) {
  const order = await Order.findOne({ _id: req.params.id, ...scopeFor(req.user) })
    .populate('requestedBy preparedBy receivedBy', 'fullName role employeeId')
    .populate('statusHistory.by', 'fullName role')
    .populate('cancellation.by', 'fullName role')
    .lean();

  // 404 also when it belongs to another ward/hospital: don't reveal it exists
  if (!order) throw AppError.notFound('Order not found');

  res.json({ success: true, order: withTimeFlags(order) });
}

// =====================================================================
// Changing status
// =====================================================================

/**
 * PATCH /api/orders/:id/status
 * Body: { status, note?, reason?, version? }
 *   status   preparing | ready | delivered | cancelled
 *   reason   required when cancelling
 *   version  the order's __v as the client last saw it. If someone changed the
 *            order since, the request is rejected instead of acting on stale data.
 *
 * Who can do what is enforced by the state machine in the Order model:
 *   pharmacist → preparing, ready · nurse/pharmacist → delivered · anyone → cancelled
 *
 * Moving to "preparing" deducts the dose from the drug's stock (same unit as the dose).
 * Everything happens in ONE transaction: status, stock, and audit entries all succeed or none do.
 */
export async function updateOrderStatus(req, res) {
  const { status, note, reason, version } = req.body ?? {};
  if (typeof status !== 'string') throw AppError.badRequest('status is required');
  for (const [k, v] of Object.entries({ note, reason })) {
    if (v !== undefined && (typeof v !== 'string' || v.length > 500)) {
      throw AppError.badRequest(`"${k}" must be text (max 500 characters)`);
    }
  }

  let result;
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({ _id: req.params.id, ...scopeFor(req.user) }).session(session);
    if (!order) throw AppError.notFound('Order not found');

    if (version !== undefined && Number(version) !== order.__v) {
      throw AppError.conflict('This order was updated by someone else. Refresh and try again.');
    }

    const from = order.status;
    // Validates transition + role, stamps timestamps, appends history (throws 403/409/422 on failure)
    order.transitionTo(status, req.user, { note, reason });

    let stock = null;
    if (status === ORDER_STATUS.PREPARING) {
      const amount = order.dose.calculatedValue;
      // Atomic "deduct only if enough": the condition and the $inc happen together,
      // so two pharmacists can never take the same last vials.
      const drug = await Drug.findOneAndUpdate(
        { _id: order.drug, hospital: order.hospital, 'stock.onHand': { $gte: amount } },
        { $inc: { 'stock.onHand': -amount } },
        { new: true, session }
      ).select('name stock dosing.unit');

      if (!drug) {
        throw AppError.conflict(
          `Insufficient stock of ${order.drugSnapshot.name} to prepare ${amount} ${order.dose.unit}. Restock first.`
        );
      }

      stock = {
        drug: drug.name,
        unit: drug.dosing.unit,
        before: drug.stock.onHand + amount,
        after: drug.stock.onHand,
        reorderLevel: drug.stock.reorderLevel,
        isLowStock: drug.stock.onHand <= drug.stock.reorderLevel,
      };

      await logAudit({
        req, session, hospital: order.hospital, actor: req.user,
        action: 'STOCK_ADJUSTED', entityType: 'Drug', entityId: drug._id,
        changes: { before: { onHand: stock.before }, after: { onHand: stock.after, reason: `Order ${order.orderNumber}` } },
      });
    }

    await order.save({ session }); // optimisticConcurrency → VersionError (409) on a race

    await logAudit({
      req, session, hospital: order.hospital, actor: req.user,
      action: status === ORDER_STATUS.CANCELLED ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
      entityType: 'Order', entityId: order._id,
      changes: {
        before: { status: from },
        after: {
          status,
          ...(note && { note }),
          ...(reason && { reason }),
          ...(status === ORDER_STATUS.CANCELLED && { wasCompounded: order.cancellation.wasCompounded }),
        },
      },
    });

    result = { order: withTimeFlags(order.toObject()), stock };
  });

  // Broadcast only after the transaction committed
  emitOrderEvent(EVENTS.ORDER_UPDATED, result.order);
  if (result.stock?.isLowStock) emitLowStock(result.order.hospital, result.stock);

  res.json({ success: true, ...result });
}