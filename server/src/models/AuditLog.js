import mongoose from 'mongoose';
import { ROLES, AUDIT_ACTIONS } from '../constants/enums.js';

// Append-only: entries can be created, never edited or deleted (enforced by the hooks below).
const auditLogSchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
    actor: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // empty for failed logins / system jobs
      role: { type: String, enum: [...Object.values(ROLES), 'system'] },
      name: String,
    },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entity: {
      type: { type: String, enum: ['Order', 'Drug', 'User', 'Hospital'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    changes: {
      before: mongoose.Schema.Types.Mixed,
      after: mongoose.Schema.Types.Mixed,
    },
    meta: {
      ip: String,
      userAgent: String,
    },
    at: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

auditLogSchema.index({ hospital: 1, at: -1 });
auditLogSchema.index({ 'entity.type': 1, 'entity.id': 1, at: 1 });
auditLogSchema.index({ 'actor.user': 1, at: -1 });

function rejectMutation() {
  throw new Error('Audit logs are append-only and cannot be modified or deleted');
}

auditLogSchema.pre('save', function () {
  if (!this.isNew) rejectMutation();
});
auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete'],
  rejectMutation
);

export default mongoose.model('AuditLog', auditLogSchema);