import mongoose from 'mongoose';
import { DEPARTMENT_TYPES } from '../constants/enums.js';

// Departments are embedded: they're small, always read with the hospital, and rarely change.
// Each still gets its own _id so users and orders can reference a specific department.
const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Department name is required'], trim: true, maxlength: 100 },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]{2,12}$/, 'Department code must be 2-12 chars (A-Z, 0-9, -)'],
    },
    type: { type: String, enum: DEPARTMENT_TYPES, required: true },
    floor: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Hospital name is required'], trim: true, maxlength: 150 },
    code: {
      type: String,
      required: [true, 'Hospital code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]{2,15}$/, 'Hospital code must be 2-15 chars (A-Z, 0-9, -)'],
    },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'Jordan' },
    timezone: { type: String, default: 'Asia/Amman' },
    departments: {
      type: [departmentSchema],
      validate: {
        // Department codes must be unique inside one hospital.
        validator: (deps) => new Set(deps.map((d) => d.code)).size === deps.length,
        message: 'Department codes must be unique within a hospital',
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hospitalSchema.methods.getDepartment = function (departmentId) {
  return this.departments.id(departmentId);
};

export default mongoose.model('Hospital', hospitalSchema);