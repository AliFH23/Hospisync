import mongoose from 'mongoose';
import { DRUG_CATEGORIES, DOSING_BASIS, DOSE_UNITS, ROUTES, STORAGE } from '../constants/enums.js';

// One document = one drug in a specific hospital's formulary (each hospital has its own stock and costs).
const drugSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: [true, 'Drug name is required'], trim: true },
    genericName: { type: String, trim: true },
    category: { type: String, enum: Object.values(DRUG_CATEGORIES), required: true },
    isHighAlert: { type: Boolean, default: true },

    // Controlled-substance schedule (e.g. "II"). Mandatory for narcotics.
    controlledSchedule: {
      type: String,
      enum: ['I', 'II', 'III', 'IV', 'V'],
      required: [function () { return this.category === DRUG_CATEGORIES.NARCOTIC; },
        'Narcotics must have a controlled-substance schedule'],
    },

    dosing: {
      basis: { type: String, enum: Object.values(DOSING_BASIS), required: true },
      unit: { type: String, enum: DOSE_UNITS, required: true },
      // Safety ceiling for ONE administered dose. Orders above it are rejected (Phase 3).
      maxSingleDose: { type: Number, min: 0 },
    },
    allowedRoutes: {
      type: [{ type: String, enum: ROUTES }],
      validate: { validator: (v) => v.length > 0, message: 'At least one route is required' },
    },

    // Beyond-use time after compounding. Drives the expiry timer and the Zero Waste dashboard.
    stability: {
      beyondUseHours: { type: Number, required: [true, 'Beyond-use hours are required'], min: 0.25, max: 24 * 45 },
      storage: { type: String, enum: STORAGE, default: 'room_temp' },
    },

    unitCost: {
      amount: { type: Number, min: 0, default: 0 }, // cost per dosing unit, used for waste-cost reports
      currency: { type: String, default: 'JOD', uppercase: true, minlength: 3, maxlength: 3 },
    },

    // Raw-material stock. Feeds the AI stock-forecasting module in Phase 4.
    stock: {
      onHand: { type: Number, min: 0, default: 0 },
      reorderLevel: { type: Number, min: 0, default: 0 },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

drugSchema.index({ hospital: 1, code: 1 }, { unique: true });
drugSchema.index({ hospital: 1, category: 1, isActive: 1 });
drugSchema.index({ name: 'text', genericName: 'text' }); // search box in the order form

drugSchema.virtual('isLowStock').get(function () {
  return this.stock.onHand <= this.stock.reorderLevel;
});

export default mongoose.model('Drug', drugSchema);