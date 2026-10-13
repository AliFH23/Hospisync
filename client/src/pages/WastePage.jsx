import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import { useTheme } from '@mui/material/styles';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import DeleteSweepOutlined from '@mui/icons-material/DeleteSweepOutlined';
import PercentRounded from '@mui/icons-material/PercentRounded';
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded';
import { BarChart } from '@mui/x-charts/BarChart';
import api, { errorMessage } from '../api/client';
import KpiCard from '../components/KpiCard';
import Ltr from '../components/Ltr';
import { LtrZone } from '../theme/PreferencesProvider';
import { shortId } from '../utils/orders';

const RANGES = [30, 90, 365];
const money = (n, cur) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

function Section({ title, subtitle, children, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} style={{ height: '100%' }}>
      <Card sx={{ p: 2.5, height: '100%' }}>
        <Typography variant="subtitle1">{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary" component="div">{subtitle}</Typography>}
        <Box sx={{ mt: 2 }}>{children}</Box>
      </Card>
    </motion.div>
  );
}

export default function WastePage() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data: d } = await api.get('/reports/waste', { params: { from } });
      setData(d);
      setError('');
    } catch (err) {
      setError(errorMessage(err, t('waste.loadError')));
    } finally {
      setLoading(false);
    }
  }, [days, t]);

  useEffect(() => { load(); }, [load]);

  const cur = data?.currency ?? 'JOD';
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { month: 'short', year: '2-digit' }), [i18n.language]);
  const months = data?.byMonth ?? [];
  const maxDrug = Math.max(1, ...(data?.byDrug ?? []).map((d) => d.wasteCost));
  const maxReason = Math.max(1, ...(data?.topReasons ?? []).map((r) => r.count));
  const tot = data?.totals;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('waste.period')}</Typography>
          <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)} color="primary">
            {RANGES.map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}>{t(`waste.range.${d}`)}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
      </Stack>

      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

      {/* Headline numbers */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        {!tot && [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={90} sx={{ borderRadius: 4 }} />)}
        {tot && (
          <>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
              <Card sx={{ p: 2.25, display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                <Box sx={(th) => ({ width: 46, height: 46, borderRadius: 3, display: 'grid', placeItems: 'center', flex: 'none', color: 'error.main', bgcolor: th.palette.error.light })}><PaymentsOutlined /></Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>{t('waste.kpi.cost')}</Typography>
                  <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25 }} noWrap><Ltr>{money(tot.wasteCost, cur)}</Ltr></Typography>
                </Box>
              </Card>
            </motion.div>
            <KpiCard index={1} color="warning" icon={<DeleteSweepOutlined />} label={t('waste.kpi.doses')} value={tot.wastedDoses}
              hint={t('waste.kpi.of', { count: tot.compoundedDoses.toLocaleString('en-US') })} />
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <Card sx={{ p: 2.25, display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                <Box sx={(th) => ({ width: 46, height: 46, borderRadius: 3, display: 'grid', placeItems: 'center', flex: 'none', color: 'info.main', bgcolor: th.palette.info.light })}><PercentRounded /></Box>
                <Box>
                  <Typography variant="body2" color="text.secondary" noWrap>{t('waste.kpi.rate')}</Typography>
                  <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25 }}><Ltr>{tot.wasteRatePercent}%</Ltr></Typography>
                </Box>
              </Card>
            </motion.div>
            <KpiCard index={3} color="error" icon={<HourglassBottomRounded />} label={t('waste.kpi.expired')} value={data.expiredNotDiscarded.count}
              hint={data.expiredNotDiscarded.count ? money(data.expiredNotDiscarded.potentialCost, cur) : null} />
          </>
        )}
      </Box>

      {/* Doses that expired on the shelf: not yet cancelled, so not yet counted */}
      {data?.expiredNotDiscarded.count > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{t('waste.expiredTitle')}</Typography>
          {data.expiredNotDiscarded.orders.slice(0, 5).map((o) => (
            <Typography key={o._id} variant="body2">
              <Ltr>{o.drugSnapshot.name} {o.dose.calculatedValue} {o.dose.unit}</Ltr> · <Ltr>{o.departmentCode}</Ltr> · <Ltr>{shortId(o.orderNumber)}</Ltr>
            </Typography>
          ))}
        </Alert>
      )}

      <Box sx={{ opacity: loading && data ? 0.55 : 1, transition: 'opacity .2s' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.4fr) minmax(0,1fr)' }, gap: 2.5 }}>
          {/* Monthly trend */}
          <Section title={t('waste.trend')} subtitle={t('waste.trendHint', { cur })} delay={0.1}>
            {!data && <Skeleton variant="rounded" height={260} sx={{ borderRadius: 3 }} />}
            {data && months.length === 0 && <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>{t('waste.none')}</Typography>}
            {data && months.length > 0 && (
              <LtrZone>
                <BarChart
                  height={270}
                  hideLegend
                  borderRadius={4}
                  margin={{ left: 8, right: 8, top: 10, bottom: 4 }}
                  xAxis={[{ scaleType: 'band', data: months.map((m) => monthFmt.format(new Date(`${m.month}-01T00:00:00`))), height: 34, disableLine: true, disableTicks: true, categoryGapRatio: 0.45 }]}
                  yAxis={[{ width: 56, valueFormatter: (v) => v.toLocaleString('en-US'), disableLine: true, disableTicks: true }]}
                  series={[{
                    id: 'cost', data: months.map((m) => m.wasteCost), label: t('waste.kpi.cost'), color: theme.palette.error.main,
                    valueFormatter: (v, { dataIndex }) => `${money(v, cur)} · ${months[dataIndex].wastedDoses} / ${months[dataIndex].compoundedDoses} (${months[dataIndex].wasteRatePercent}%)`,
                  }]}
                  grid={{ horizontal: true }}
                  sx={{ '& .MuiChartsGrid-line': { stroke: theme.palette.divider }, '& .MuiChartsAxis-tickLabel': { fill: theme.palette.text.secondary } }}
                />
              </LtrZone>
            )}
          </Section>

          {/* Which drugs cost the most */}
          <Section title={t('waste.byDrug')} subtitle={t('waste.byDrugHint')} delay={0.15}>
            {!data && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} />)}
            {data?.byDrug.length === 0 && <Typography color="text.secondary">{t('waste.none')}</Typography>}
            {data?.byDrug.map((d, i) => (
              <Box key={d.drug} sx={{ mb: 1.75 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                  <Typography dir="ltr" noWrap sx={{ fontWeight: 600, fontSize: 14, textAlign: 'left', minWidth: 0 }}>{d.drug}</Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}><Ltr>{money(d.wasteCost, cur)}</Ltr></Typography>
                </Stack>
                <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'divider', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(d.wasteCost / maxDrug) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.05 }}
                    style={{ height: '100%', borderRadius: 3, background: theme.palette.error.main }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {t('waste.dosesCount', { count: d.wastedDoses })} · <Ltr>{d.wastedAmount}</Ltr>
                </Typography>
              </Box>
            ))}
          </Section>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.4fr) minmax(0,1fr)' }, gap: 2.5, mt: 2.5 }}>
          {/* By ward */}
          <Section title={t('waste.byWard')} delay={0.2}>
            {!data && <Skeleton variant="rounded" height={180} />}
            {data && (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ '& td, & th': { borderColor: 'divider' }, '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('waste.col.ward')}</TableCell>
                      <TableCell align="right">{t('waste.col.compounded')}</TableCell>
                      <TableCell align="right">{t('waste.col.wasted')}</TableCell>
                      <TableCell align="right">{t('waste.col.rate')}</TableCell>
                      <TableCell align="right">{t('waste.col.cost')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.byDepartment.map((d) => (
                      <TableRow key={d.department}>
                        <TableCell sx={{ fontWeight: 600 }}><Ltr>{d.department}</Ltr></TableCell>
                        <TableCell align="right"><Ltr>{d.compoundedDoses.toLocaleString('en-US')}</Ltr></TableCell>
                        <TableCell align="right"><Ltr>{d.wastedDoses}</Ltr></TableCell>
                        <TableCell align="right" sx={{ color: d.wasteRatePercent >= 5 ? 'error.main' : 'text.primary', fontWeight: d.wasteRatePercent >= 5 ? 700 : 400 }}>
                          <Ltr>{d.wasteRatePercent}%</Ltr>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}><Ltr>{money(d.wasteCost, cur)}</Ltr></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Section>

          {/* Why doses were cancelled */}
          <Section title={t('waste.reasons')} subtitle={t('waste.reasonsHint')} delay={0.25}>
            {!data && [0, 1, 2].map((i) => <Skeleton key={i} height={36} />)}
            {data?.topReasons.length === 0 && <Typography color="text.secondary">{t('waste.none')}</Typography>}
            {data?.topReasons.map((r) => (
              <Box key={r.reason} sx={{ mb: 1.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" dir="auto" noWrap sx={{ minWidth: 0, '&::first-letter': { textTransform: 'uppercase' } }}>{r.reason}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}><Ltr>{r.count}</Ltr></Typography>
                </Stack>
                <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'divider', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(r.count / maxReason) * 100}%` }} transition={{ duration: 0.6 }}
                    style={{ height: '100%', borderRadius: 3, background: theme.palette.text.secondary }} />
                </Box>
              </Box>
            ))}
          </Section>
        </Box>
      </Box>
    </Stack>
  );
}