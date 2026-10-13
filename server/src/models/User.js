import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, WARD_ROLES } from '../constants/enums.js';

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 100 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    // Never returned by queries unless explicitly requested with .select('+password')
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [10, 'Password must be at least 10 characters'],
      select: false,
    },
    role: { type: String, enum: Object.values(ROLES), required: true },
    employeeId: { type: String, required: true, trim: true, uppercase: true },
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
    // _id of an embedded department inside the hospital. Doctors and nurses work in a ward.
    department: {
      type: mongoose.Schema.Types.ObjectId,
      required: [function () { return WARD_ROLES.includes(this.role); }, 'Doctors and nurses must belong to a department'],
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    passwordChangedAt: Date, // used in Phase 2 to invalidate older JWTs
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// An employee ID is unique per hospital, not globally.
userSchema.index({ hospital: 1, employeeId: 1 }, { unique: true });
userSchema.index({ hospital: 1, role: 1, isActive: 1 });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('User', userSchema);