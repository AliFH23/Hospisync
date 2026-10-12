import { Order } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { ORDER_STATUS } from '../constants/enums.js';

const CURRENCY = 'JOD'; // matches Drug.unitCost default currency
const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

function parseRange(query) {
  const to = query.to ? new Date(String(query.to)) : new Date();
  const from = query.from ? new Date(String(query.from)) : new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw AppError.badRequest('Invalid from/to date');
  if (from > to) throw AppError.badRequest('"from" must be before "to"');
  if (to - from > 366 * 24 * 3600 * 1000) throw AppError.badRequest('Range cannot exceed one year');
  return { from, to };
}

/**
 * Aggregation pipeline for the waste report (exported so it can be tested on its own).
 * A dose counts as WASTED when it was cancelled after compounding started.
 * Waste rate = wasted / (delivered + wasted) among compounded doses in the range.
 */
export function wastePipeline(hospitalId, from, to) {
  const range = { $gte: from, $lte: to };
  const wasted = { $eq: ['$status', ORDER_STATUS.CANCELLED] };

  return [
    {
      $match: {
        hospital: hospitalId,
        $or: [
          { status: ORDER_STATUS.CANCELLED, 'cancellation.wasCompounded': true, 'cancellation.at': range },
          { status: ORDER_STATUS.DELIVERED, deliveredAt: range },
        ],
      },
    },
    {
      $addFields: {
        wasted: { $cond: [wasted, 1, 0] },
        cost: { $multiply: [{ $ifNull: ['$dose.calculatedValue', 0] }, { $ifNull: ['$drugSnapshot.unitCost', 0] }] },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              compounded: { $sum: 1 },
              wasted: { $sum: '$wasted' },
              wasteCost: { $sum: { $multiply: ['$cost', '$wasted'] } },
            },
          },
        ],
        byDepartment: [
          {
            $group: {
              _id: '$departmentCode',
              compounded: { $sum: 1 },
              wasted: { $sum: '$wasted' },
              wasteCost: { $sum: { $multiply: ['$cost', '$wasted'] } },
            },
          },
          { $sort: { wasteCost: -1, wasted: -1 } },
        ],
        byDrug: [
          { $match: { wasted: 1 } },
          {
            $group: {
              _id: '$drugSnapshot.name',
              category: { $first: '$drugSnapshot.category' },
              doses: { $sum: 1 },
              amount: { $sum: '$dose.calculatedValue' },
              unit: { $first: '$dose.unit' },
              wasteCost: { $sum: '$cost' },
            },
          },
          { $sort: { wasteCost: -1 } },
          { $limit: 10 },
        ],
        topReasons: [
          { $match: { wasted: 1 } },
          { $group: { _id: { $toLower: { $trim: { input: '$cancellation.reason' } } }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ],
      },
    },
  ];
}

/**
 * GET /api/reports/waste?from=&to=   (pharmacist, admin)
 * Defaults to the last 30 days.
 */
export async function getWasteReport(req, res) {
  const { from, to } = parseRange(req.query);
  const hospital = req.user.hospital;

  const [[facets], atRisk] = await Promise.all([
    Order.aggregate(wastePipeline(hospital, from, to)),
    // Ready doses already past expiry: waste that hasn't been recorded yet
    Order.find({ hospital, status: ORDER_STATUS.READY, expiresAt: { $lte: new Date() } })
      .select('orderNumber departmentCode drugSnapshot.name drugSnapshot.unitCost dose.calculatedValue dose.unit expiresAt')
      .sort({ expiresAt: 1 })
      .lean(),
  ]);

  const t = facets.totals[0] ?? { compounded: 0, wasted: 0, wasteCost: 0 };
  const rate = (w, c) => (c ? round2((w / c) * 100) : 0);

  res.json({
    success: true,
    range: { from, to },
    currency: CURRENCY,
    totals: {
      compoundedDoses: t.compounded,
      wastedDoses: t.wasted,
      deliveredDoses: t.compounded - t.wasted,
      wasteRatePercent: rate(t.wasted, t.compounded),
      wasteCost: round2(t.wasteCost),
    },
    byDepartment: facets.byDepartment.map((d) => ({
      department: d._id,
      compoundedDoses: d.compounded,
      wastedDoses: d.wasted,
      wasteRatePercent: rate(d.wasted, d.compounded),
      wasteCost: round2(d.wasteCost),
    })),
    byDrug: facets.byDrug.map((d) => ({
      drug: d._id,
      category: d.category,
      wastedDoses: d.doses,
      wastedAmount: `${round2(d.amount)} ${d.unit}`,
      wasteCost: round2(d.wasteCost),
    })),
    topReasons: facets.topReasons.map((r) => ({ reason: r._id, count: r.count })),
    expiredNotDiscarded: {
      count: atRisk.length,
      potentialCost: round2(atRisk.reduce((s, o) => s + o.dose.calculatedValue * (o.drugSnapshot.unitCost || 0), 0)),
      orders: atRisk,
    },
  });
}