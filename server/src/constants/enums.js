// Central enums: one source of truth shared by models, services, and (later) the AI module.

export const ROLES = Object.freeze({
  NURSE: 'nurse',
  PHARMACIST: 'pharmacist',
  ADMIN: 'admin',
});

export const DEPARTMENT_TYPES = Object.freeze([
  'ICU', 'ER', 'ONCOLOGY', 'HEMATOLOGY', 'PEDIATRICS', 'NICU', 'SURGERY', 'MEDICAL', 'OTHER',
]);

export const DRUG_CATEGORIES = Object.freeze({
  CHEMOTHERAPY: 'chemotherapy',
  TPN: 'tpn',
  NARCOTIC: 'narcotic',
  OTHER_HIGH_ALERT: 'other_high_alert',
});

export const DOSING_BASIS = Object.freeze({
  FIXED: 'fixed',   // e.g. 4 mg
  WEIGHT: 'weight', // e.g. mg/kg
  BSA: 'bsa',       // e.g. mg/m2 (typical for chemo)
});

export const DOSE_UNITS = Object.freeze(['mg', 'mcg', 'g', 'units', 'mL', 'mmol', 'mEq']);

export const ROUTES = Object.freeze(['IV_INFUSION', 'IV_PUSH', 'IV_PIGGYBACK', 'CENTRAL_LINE', 'INTRATHECAL', 'SUBCUT']);

export const STORAGE = Object.freeze(['room_temp', 'refrigerated', 'frozen', 'protect_from_light']);

export const PRIORITY = Object.freeze({
  EMERGENCY: 'emergency',
  URGENT: 'urgent',
  ROUTINE: 'routine',
});

// Lower rank = higher in the pharmacist queue. Stored on the order so the queue is one indexed sort.
export const PRIORITY_RANK = Object.freeze({ emergency: 1, urgent: 2, routine: 3 });

export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

// ---- Workflow state machine ----
// Allowed transitions: anything not listed here is rejected.
export const TRANSITIONS = Object.freeze({
  pending:   ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['delivered', 'cancelled'],
  delivered: [], // terminal
  cancelled: [], // terminal
});

// Which roles may move an order INTO each status.
export const TRANSITION_ROLES = Object.freeze({
  preparing: [ROLES.PHARMACIST],
  ready:     [ROLES.PHARMACIST],
  delivered: [ROLES.NURSE, ROLES.PHARMACIST], // receiving nurse confirms handover
  cancelled: [ROLES.NURSE, ROLES.PHARMACIST, ROLES.ADMIN],
});

export const AUDIT_ACTIONS = Object.freeze([
  'ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'ORDER_CANCELLED', 'ORDER_UPDATED',
  'DRUG_CREATED', 'DRUG_UPDATED', 'STOCK_ADJUSTED',
  'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'LOGIN_SUCCESS', 'LOGIN_FAILED',
  'HOSPITAL_CREATED', 'HOSPITAL_UPDATED',
]);