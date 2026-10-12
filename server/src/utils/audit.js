import { AuditLog } from '../models/index.js';

/**
 * Writes one append-only audit entry.
 * @param {object} p
 * @param {import('express').Request} [p.req] - adds IP and user agent when given
 * @param {*} p.hospital - hospital id
 * @param {{ _id, role, fullName }} [p.actor] - who did it (omit for system actions)
 * @param {string} p.action - one of AUDIT_ACTIONS
 * @param {'Order'|'Drug'|'User'|'Hospital'} p.entityType
 * @param {*} p.entityId
 * @param {{ before?, after? }} [p.changes]
 */
export function logAudit({ req, hospital, actor, action, entityType, entityId, changes }) {
  return AuditLog.create({
    hospital,
    actor: actor
      ? { user: actor._id, role: actor.role, name: actor.fullName }
      : { role: 'system', name: 'system' },
    action,
    entity: { type: entityType, id: entityId },
    changes,
    meta: req ? { ip: req.ip, userAgent: req.get('user-agent') } : undefined,
  });
}