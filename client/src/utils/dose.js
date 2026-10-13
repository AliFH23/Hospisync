// Client-side mirror of the server's dose rules (Order model + createOrder).
// Used only for instant feedback while typing: the server re-checks everything.

/** Mosteller: BSA (m²) = sqrt(height_cm × weight_kg / 3600), rounded to 2 decimals */
export function bsa(heightCm, weightKg) {
  if (!(heightCm > 0) || !(weightKg > 0)) return null;
  return Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;
}

/** "mg/m²", "mcg/kg" or "mg" */
export function basisLabel(drug) {
  if (!drug) return '';
  const { basis, unit } = drug.dosing;
  return basis === 'bsa' ? `${unit}/m²` : basis === 'weight' ? `${unit}/kg` : unit;
}

/** "IV_INFUSION" → "IV infusion" (clinical abbreviation, never translated) */
export const routeLabel = (r) => r.replaceAll('_', ' ').toLowerCase().replace(/^iv /, 'IV ');

/**
 * Final dose + which patient measurements are missing.
 * @returns {{ value: number|null, bsa: number|null, missing: ('weight'|'height')[] }}
 */
export function calculateDose(drug, prescribed, weightKg, heightCm) {
  const p = Number(prescribed);
  const w = Number(weightKg);
  const h = Number(heightCm);
  const b = bsa(h, w);
  if (!drug || !(p > 0)) return { value: null, bsa: b, missing: [] };

  const { basis } = drug.dosing;
  const missing = [];
  if ((basis === 'weight' || basis === 'bsa') && !(w > 0)) missing.push('weight');
  if (basis === 'bsa' && !(h > 0)) missing.push('height');
  if (missing.length) return { value: null, bsa: b, missing };

  const raw = basis === 'fixed' ? p : basis === 'weight' ? p * w : p * b;
  return { value: +raw.toFixed(3), bsa: b, missing };
}

/** Same matching rule as the server: allergy text (3+ chars) contained in the drug or generic name */
export function findAllergy(drug, allergies) {
  if (!drug) return null;
  const names = [drug.name, drug.genericName].filter(Boolean).map((n) => n.toLowerCase());
  return allergies.find((a) => {
    const s = String(a).toLowerCase().trim();
    return s.length >= 3 && names.some((n) => n.includes(s));
  }) ?? null;
}

/** Date → value for <input type="datetime-local"> in the browser's local time */
export function toLocalInput(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}