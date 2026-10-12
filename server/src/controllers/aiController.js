import { Hospital } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { getForecast, getStockRecommendations } from '../services/aiClient.js';

// Hospital comes from the logged-in user, never from the request
async function hospitalCode(req) {
  const h = await Hospital.findById(req.user.hospital).select('code').lean();
  if (!h) throw AppError.notFound('Hospital not found');
  return h.code;
}

function intParam(value, name, min, max) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw AppError.badRequest(`"${name}" must be an integer ${min}-${max}`);
  return n;
}

// GET /api/ai/forecast?horizon=14
export async function forecast(req, res) {
  const data = await getForecast(await hospitalCode(req), {
    horizon: intParam(req.query.horizon, 'horizon', 7, 28),
  });
  res.json({ success: true, ...data });
}

// GET /api/ai/stock?horizon=14&leadTimeDays=3
export async function stock(req, res) {
  const data = await getStockRecommendations(await hospitalCode(req), {
    horizon: intParam(req.query.horizon, 'horizon', 7, 28),
    leadTimeDays: intParam(req.query.leadTimeDays, 'leadTimeDays', 1, 14),
  });
  res.json({ success: true, ...data });
}
