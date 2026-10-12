import AppError from '../utils/AppError.js';

// Talks to the Python AI service. Node is the only caller: the browser never reaches it directly.
const BASE_URL = process.env.AI_SERVICE_URL;
const KEY = process.env.AI_INTERNAL_KEY;

export const aiEnabled = () => Boolean(BASE_URL && KEY);

/**
 * GET a JSON endpoint on the AI service.
 * Turns every failure (down, timeout, bad key) into a clean 503 for our clients.
 */
async function aiGet(path, params = {}, timeoutMs = 30000) {
  if (!aiEnabled()) throw new AppError('AI service is not configured', 503);

  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  let res;
  try {
    res = await fetch(url, {
      headers: { 'X-Internal-Key': KEY },
      signal: AbortSignal.timeout(timeoutMs), // first forecast can take ~10s; never hang forever
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : 'is unreachable';
    throw new AppError(`AI service ${reason}. Try again shortly.`, 503);
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    console.error('[ai] internal key rejected: check AI_INTERNAL_KEY matches ai-service INTERNAL_API_KEY');
    throw new AppError('AI service unavailable', 503);
  }
  if (res.status === 404) throw AppError.notFound(body.detail || 'Not found in AI service');
  if (!res.ok) throw new AppError('AI service error', 503);
  return body;
}

export const getForecast = (hospitalCode, { horizon } = {}) =>
  aiGet('/forecast', { hospital: hospitalCode, horizon });

export const getStockRecommendations = (hospitalCode, { horizon, leadTimeDays } = {}) =>
  aiGet('/stock/recommendations', { hospital: hospitalCode, horizon, leadTimeDays });
