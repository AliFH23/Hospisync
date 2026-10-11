import mongoose from 'mongoose';
import crypto from 'node:crypto';
import {
  ROLES, DRUG_CATEGORIES, DOSING_BASIS, DOSE_UNITS, ROUTES,
  PRIORITY, PRIORITY_RANK, ORDER_STATUS, TRANSITIONS, TRANSITION_ROLES,
} from '../constants/enums.js';

const { ObjectId } = mongoose.Schema.Types;

// ---------- Sub-schemas ----------

const patientSchema = new mongoose.Schema(
  {
    mrn: { type: String, required: [true, 'Patient MRN is required'], trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    weightKg: { type: Number, min: [0.3, 'Weight too low'], max: [400, 'Weight too high'] },
    heightCm: { type: Number, min: [20, 'Height too low'], max: [250, 'Height too high'] },
    bsa: { type: Number, min: 0 }, // m2, computed automatically (Mosteller)
    allergies: [{ type: String, trim: true }],
  },
  { _id: false }
);

const doseSchema = new mongoose.Schema(
  {
    // What the prescriber wrote, e.g. 75 mg/m2 → prescribedValue=75, basis=bsa, unit=mg
    prescribedValue: { type: Number, required: true, min: [0, 'Dose must be positive'] },
    basis: { type: String, enum: Object.values(DOSING_BASIS), required: true },
    unit: { type: String, enum: DOSE_UNITS, required: true },
    // Final administered amount after applying weight/BSA. Computed automatically.
    calculatedValue: { type: Number, min: 0 },
  },
  { _id: false }
);

const statusEventSchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...Object.values(ORDER_STATUS), null] },
    to: { type: String, enum: Object.values(ORDER_STATUS), required: true },
    by: { type: ObjectId, ref: 'User', required: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

// ---------- Order ----------

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true }, // e.g. HS-20261012-7F3A9C

    hospital: { type: ObjectId, ref: 'Hospital', required: true },
    department: { type: ObjectId, required: true }, // embedded department _id
    departmentCode: { type: String, required: true, uppercase: true },

    patient: { type: patientSchema, required: true },

    drug: { type: ObjectId, ref: 'Drug', required: true },
    // Snapshot at order time: the order stays correct even if the formulary entry changes later.
    drugSnapshot: {
      name: { type: String, required: true },
      category: { type: String, enum: Object.values(DRUG_CATEGORIES), required: true },
      beyondUseHours: { type: Number, required: true },
      unitCost: { type: Number, default: 0 },
    },

    dose: { type: doseSchema, required: true },
    route: { type: String, enum: ROUTES, required: true },
    diluent: {
      name: { type: String, trim: true },
      volumeMl: { type: Number, min: 0 },
    },
    infusionDurationMin: { type: Number, min: 0 },

    priority: { type: String, enum: Object.values(PRIORITY), default: PRIORITY.ROUTINE },
    priorityRank: { type: Number }, // derived from priority, used for queue sorting
    requiredBy: { type: Date, required: [true, 'Required-by time is required'] },
    notes: { type: String, trim: true, maxlength: 1000 },

    // ---- State machine ----
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PENDING },
    statusHistory: [statusEventSchema],

    requestedBy: { type: ObjectId, ref: 'User', required: true },
    preparedBy: { type: ObjectId, ref: 'User' },
    deliveredBy: { type: ObjectId, ref: 'User' },
    receivedBy: { type: ObjectId, ref: 'User' },

    preparingAt: Date,
    readyAt: Date,
    deliveredAt: Date,
    expiresAt: Date, // readyAt + beyond-use hours

    cancellation: {
      reason: { type: String, trim: true },
      by: { type: ObjectId, ref: 'User' },
      at: Date,
      wasCompounded: Boolean, // cancelled after preparation = wasted dose (Zero Waste dashboard)
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true, // two pharmacists can't overwrite each other's status change
  }
);

// ---------- Indexes (query patterns we know we'll need) ----------
orderSchema.index({ hospital: 1, status: 1, priorityRank: 1, requiredBy: 1 }); // pharmacist queue
orderSchema.index({ hospital: 1, department: 1, status: 1, createdAt: -1 });  // ward tracking screen
orderSchema.index({ hospital: 1, 'patient.mrn': 1, createdAt: -1 });           // patient history
orderSchema.index({ status: 1, expiresAt: 1 });                                // near-expiry alerts
orderSchema.index({ hospital: 1, drug: 1, createdAt: 1 });                     // AI usage history

// ---------- Helpers ----------

// Mosteller formula: BSA (m2) = sqrt(height_cm * weight_kg / 3600)
function mostellerBsa(heightCm, weightKg) {
  return Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;
}

function generateOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `HS-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// ---------- Validation & derived fields ----------

orderSchema.pre('validate', function () {
  if (this.isNew && !this.orderNumber) this.orderNumber = generateOrderNumber();
  if (this.priority) this.priorityRank = PRIORITY_RANK[this.priority];

  const p = this.patient;
  const dose = this.dose;
  if (!p || !dose) return; // "required" validators will report it

  if (dose.basis === DOSING_BASIS.WEIGHT && !p.weightKg) {
    this.invalidate('patient.weightKg', 'Weight is required for weight-based dosing');
  }
  if (dose.basis === DOSING_BASIS.BSA) {
    if (!p.weightKg) this.invalidate('patient.weightKg', 'Weight is required for BSA-based dosing');
    if (!p.heightCm) this.invalidate('patient.heightCm', 'Height is required for BSA-based dosing');
  }

  if (p.weightKg && p.heightCm) p.bsa = mostellerBsa(p.heightCm, p.weightKg);

  if (dose.basis === DOSING_BASIS.FIXED) dose.calculatedValue = dose.prescribedValue;
  else if (dose.basis === DOSING_BASIS.WEIGHT && p.weightKg) dose.calculatedValue = +(dose.prescribedValue * p.weightKg).toFixed(3);
  else if (dose.basis === DOSING_BASIS.BSA && p.bsa) dose.calculatedValue = +(dose.prescribedValue * p.bsa).toFixed(3);

  if (this.isNew && this.requiredBy && this.requiredBy < new Date()) {
    this.invalidate('requiredBy', 'Required-by time cannot be in the past');
  }
  if (this.isNew && this.status !== ORDER_STATUS.PENDING) {
    this.invalidate('status', 'New orders must start as pending');
  }
});

// Status may only change through transitionTo(). Blocks `order.status = 'delivered'; order.save()`.
orderSchema.pre('save', function () {
  if (this.isNew) {
    if (this.statusHistory.length === 0) {
      this.statusHistory.push({ from: null, to: ORDER_STATUS.PENDING, by: this.requestedBy, role: ROLES.NURSE });
    }
    return;
  }
  if (this.isModified('status') && !this.$locals.viaStateMachine) {
    throw new Error('Order status must be changed via transitionTo()');
  }
  this.$locals.viaStateMachine = false;
});

// Direct update queries would bypass the state machine and history, so status changes there are blocked.
function blockStatusInQueryUpdate() {
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  if ('status' in update || 'status' in set) {
    throw new Error('Order status cannot be changed with update queries; use transitionTo()');
  }
}
orderSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], blockStatusInQueryUpdate);

// ---------- State machine ----------

orderSchema.statics.canTransition = function (from, to, role) {
  return (TRANSITIONS[from] || []).includes(to) && (TRANSITION_ROLES[to] || []).includes(role);
};

/**
 * Move the order to a new status. Validates the transition and the actor's role,
 * stamps timestamps/actors, and appends to statusHistory. Caller then calls save().
 * @param {string} to - target status
 * @param {{ _id, role }} user - acting user
 * @param {{ note?: string, reason?: string }} [opts]
 */
orderSchema.methods.transitionTo = function (to, user, opts = {}) {
  const from = this.status;
  if (!(TRANSITIONS[from] || []).includes(to)) {
    const err = new Error(`Invalid transition: ${from} → ${to}`);
    err.statusCode = 409;
    throw err;
  }
  if (!(TRANSITION_ROLES[to] || []).includes(user.role)) {
    const err = new Error(`Role "${user.role}" cannot move an order to "${to}"`);
    err.statusCode = 403;
    throw err;
  }

  const now = new Date();
  switch (to) {
    case ORDER_STATUS.PREPARING:
      this.preparedBy = user._id;
      this.preparingAt = now;
      break;
    case ORDER_STATUS.READY:
      this.readyAt = now;
      this.expiresAt = new Date(now.getTime() + this.drugSnapshot.beyondUseHours * 3600 * 1000);
      break;
    case ORDER_STATUS.DELIVERED:
      if (this.expiresAt && now > this.expiresAt) {
        const err = new Error('Dose has passed its beyond-use time and cannot be delivered');
        err.statusCode = 422;
        throw err;
      }
      this.deliveredAt = now;
      this.receivedBy = user._id;
      break;
    case ORDER_STATUS.CANCELLED:
      if (!opts.reason) {
        const err = new Error('A cancellation reason is required');
        err.statusCode = 400;
        throw err;
      }
      this.cancellation = {
        reason: opts.reason,
        by: user._id,
        at: now,
        wasCompounded: from === ORDER_STATUS.PREPARING || from === ORDER_STATUS.READY,
      };
      break;
    default:
      break;
  }

  this.status = to;
  this.statusHistory.push({ from, to, by: user._id, role: user.role, at: now, note: opts.note || opts.reason });
  this.$locals.viaStateMachine = true;
  return this;
};

orderSchema.virtual('isExpired').get(function () {
  return Boolean(this.expiresAt && this.status === ORDER_STATUS.READY && new Date() > this.expiresAt);
});

export default mongoose.model('Order', orderSchema);