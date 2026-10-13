import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { LineChart } from '@mui/x-charts/LineChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import api, { errorMessage } from '../api/client';
import Ltr from '../components/Ltr';
import { LtrZone } from '../theme/PreferencesProvider';

const HORIZONS = [7, 14, 28];
const MODELS = ['moving_average', 'seasonal_naive', 'seasonal_regression', 'gradient_boosting'];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/** One headline number: plain sans, proportional figures */
function Stat({ label, value, sub }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" noWrap component="div">{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }} noWrap>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" component="div" noWrap>{sub}</Typography>}
    </Box>
  );
}

export default function ForecastPage() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [horizon, setHorizon] = useState(14);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/ai/forecast', { params: { horizon } });
      setData(d);
      setSelected((s) => (d.drugs.some((x) => x.drugId === s) ? s : d.drugs[0]?.drugId));
      setError('');
    } catch (err) {
      setError(err.response?.status >= 500 || !err.response ? t('stock.offline') : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [horizon, t]);

  useEffect(() => { load(); }, [load]);

  const drug = data?.drugs.find((d) => d.drugId === selected);

  // Axis ticks: "6 Sept" in English, "06/09" in Arabic (Arabic month names are long and would crowd the axis).
  // Tooltip: full date in the UI language, always Western digits.
  const ar = i18n.language === 'ar';
  const tickFmt = useMemo(() => new Intl.DateTimeFormat('en-GB', ar ? { day: '2-digit', month: '2-digit' } : { day: 'numeric', month: 'short' }), [ar]);
  const tipFmt = useMemo(() => new Intl.DateTimeFormat(ar ? 'ar-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), [ar]);

  // One x-axis: history days then forecast days. The forecast line starts at the last actual
  // point so the two lines join; the dash is what says "projection".
  const chart = useMemo(() => {
    if (!drug) return null;
    const h = drug.history;
    const f = drug.forecast;
    const dates = [...h, ...f].map((p) => new Date(`${p.date}T00:00:00`));
    const actual = [...h.map((p) => p.amount), ...f.map(() => null)];
    const forecast = [...h.map((_, i) => (i === h.length - 1 ? h[i].amount : null)), ...f.map((p) => p.amount)];
    return { dates, actual, forecast };
  }, [drug]);

  const color = theme.palette.primary.main;
  const unitFmt = (v) => (v == null ? '' : `${fmt(v)} ${drug?.unit ?? ''}`);
  const bestBaseline = drug ? Math.min(drug.backtestDailyError.moving_average, drug.backtestDailyError.seasonal_naive) : 0;
  const improvement = drug && bestBaseline ? 1 - drug.backtestDailyError[drug.model] / bestBaseline : 0;

  return (
    <Stack spacing={2.5}>
      {/* Filters */}
      <Stack direction="row" sx={{ alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('stockPage.horizon')}</Typography>
          <ToggleButtonGroup size="small" exclusive value={horizon} onChange={(_, v) => v && setHorizon(v)} color="primary">
            {HORIZONS.map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}><Ltr>{d} d</Ltr></ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ flex: 1 }} />
        {data && (
          <Typography variant="caption" color="text.secondary">
            {t('forecastPage.trainedOn')} <Ltr>{data.trainedOn.from} → {data.trainedOn.to}</Ltr>
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>{error}</Alert>}

      {/* Drug picker */}
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
        {!data && loading && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" width={130} height={36} sx={{ borderRadius: 5, flex: 'none' }} />)}
        {data?.drugs.map((d) => {
          const on = d.drugId === selected;
          return (
            <Box key={d.drugId} component={motion.button} type="button" whileTap={{ scale: 0.96 }} onClick={() => setSelected(d.drugId)}
              sx={(th) => ({ flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: 600, px: 2, py: 0.9, borderRadius: 5, border: '1.5px solid',
                borderColor: on ? 'primary.main' : 'divider', color: on ? 'primary.contrastText' : 'text.primary',
                bgcolor: on ? 'primary.main' : 'background.paper', transition: 'all .2s',
                '&:hover': { borderColor: 'primary.main', bgcolor: on ? 'primary.main' : alpha(th.palette.primary.main, 0.06) } })}>
              <bdi dir="ltr">{d.name}</bdi>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 320px' }, gap: 2.5, alignItems: 'start' }}>
        {/* Main chart */}
        <Card sx={{ p: 2.5 }}>
          {!drug && <Skeleton variant="rounded" height={380} sx={{ borderRadius: 3 }} />}
          {drug && (
            <motion.div key={drug.drugId + horizon} initial={{ opacity: 0 }} animate={{ opacity: loading ? 0.55 : 1 }} transition={{ duration: 0.3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
                <Stat label={t('forecastPage.next', { days: data.horizonDays })} value={<Ltr>{fmt(drug.forecastTotal)} {drug.unit}</Ltr>} />
                <Stat label={t('forecastPage.perDay')} value={<Ltr>{fmt(drug.forecastTotal / data.horizonDays)} {drug.unit}</Ltr>} />
                <Stat label={t('forecastPage.accuracy')} value={<Ltr>±{pct(drug.backtestTotalError)}</Ltr>} sub={t('forecastPage.accuracyHint', { days: data.horizonDays })} />
              </Box>

              {/* Custom legend: both series share one hue (one drug); the line style tells them apart */}
              <Stack direction="row" spacing={2.5} sx={{ mb: 0.5 }}>
                {[['actual', 'none'], ['forecast', '5 4']].map(([k, dash]) => (
                  <Stack key={k} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <svg width="22" height="6" aria-hidden><line x1="1" y1="3" x2="21" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" /></svg>
                    <Typography variant="caption" color="text.secondary">{t(`forecastPage.legend.${k}`)}</Typography>
                  </Stack>
                ))}
              </Stack>

              {/* Charts read left-to-right in time, also in Arabic */}
              <LtrZone>
              <Box sx={{ mx: -1, '& path[data-series="forecast"]': { strokeDasharray: '5 4' } }}>
                <LineChart
                  height={320}
                  hideLegend
                  margin={{ left: 8, right: 16, top: 12, bottom: 4 }}
                  xAxis={[{ scaleType: 'time', data: chart.dates, valueFormatter: (d, ctx) => (ctx.location === 'tick' ? tickFmt : tipFmt).format(d), tickNumber: 8, height: 34, disableLine: true, disableTicks: true }]}
                  yAxis={[{ min: 0, width: 64, valueFormatter: (v) => fmt(v), disableLine: true, disableTicks: true }]}
                  series={[
                    { id: 'actual', data: chart.actual, label: t('forecastPage.legend.actual'), color, showMark: false, curve: 'monotoneX', valueFormatter: unitFmt },
                    { id: 'forecast', data: chart.forecast, label: t('forecastPage.legend.forecast'), color, showMark: false, curve: 'monotoneX', valueFormatter: unitFmt },
                  ]}
                  grid={{ horizontal: true }}
                  sx={{ '& .MuiChartsGrid-line': { stroke: theme.palette.divider, strokeDasharray: 'none' }, '& .MuiChartsAxis-tickLabel': { fill: theme.palette.text.secondary } }}
                />
              </Box>
              </LtrZone>
            </motion.div>
          )}
        </Card>

        {/* How the model was chosen */}
        <Card sx={{ p: 2.5 }}>
          <Typography variant="subtitle1">{t('forecastPage.modelTitle')}</Typography>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2, lineHeight: 1.6 }}>{t('forecastPage.modelHint')}</Typography>
          {!drug && [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} />)}
          {drug && MODELS.map((m) => {
            const err = drug.backtestDailyError[m];
            const chosen = m === drug.model;
            const worst = Math.max(...Object.values(drug.backtestDailyError));
            return (
              <Box key={m} sx={{ mb: 1.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                    {chosen && <CheckCircleRounded sx={{ fontSize: 16, color: 'primary.main' }} />}
                    <Typography variant="body2" noWrap sx={{ fontWeight: chosen ? 700 : 400 }}>{t(`forecastPage.models.${m}`)}</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: chosen ? 700 : 400, color: chosen ? 'text.primary' : 'text.secondary' }}><Ltr>{pct(err)}</Ltr></Typography>
                </Stack>
                <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'divider', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(err / worst) * 100}%` }} transition={{ duration: 0.6 }}
                    style={{ height: '100%', borderRadius: 3, background: chosen ? color : theme.palette.text.disabled }} />
                </Box>
              </Box>
            );
          })}
          {drug && improvement > 0.005 && (
            <Typography variant="body2" sx={(th) => ({ mt: 2, p: 1.5, borderRadius: 3, fontWeight: 600, color: 'primary.main',
              bgcolor: alpha(th.palette.primary.main, th.palette.mode === 'dark' ? 0.14 : 0.07) })}>
              {t('forecastPage.improvement', { pct: Math.round(improvement * 100) })}
            </Typography>
          )}
        </Card>
      </Box>

      {/* All drugs at a glance (also the table view of the chart data) */}
      {data && (
        <Card sx={{ p: { xs: 1.5, md: 2.5 } }}>
          <Typography variant="subtitle1" sx={{ mb: 1.5, px: { xs: 1, md: 0 } }}>{t('forecastPage.allDrugs')}</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 640, '& td, & th': { borderColor: 'divider' }, '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('stockPage.col.drug')}</TableCell>
                  <TableCell>{t('forecastPage.col.trend', { days: data.horizonDays })}</TableCell>
                  <TableCell align="right">{t('forecastPage.next', { days: data.horizonDays })}</TableCell>
                  <TableCell align="right">{t('forecastPage.accuracy')}</TableCell>
                  <TableCell>{t('forecastPage.col.model')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.drugs.map((d) => (
                  <TableRow key={d.drugId} hover selected={d.drugId === selected} onClick={() => setSelected(d.drugId)} sx={{ cursor: 'pointer' }}>
                    <TableCell><Typography dir="ltr" sx={{ fontWeight: 600, fontSize: 14, textAlign: 'left' }}>{d.name}</Typography></TableCell>
                    <TableCell sx={{ width: 160 }}>
                      <LtrZone><SparkLineChart data={d.forecast.map((p) => p.amount)} height={28} width={140} color={color} curve="monotoneX" /></LtrZone>
                    </TableCell>
                    <TableCell align="right"><Ltr>{fmt(d.forecastTotal)} {d.unit}</Ltr></TableCell>
                    <TableCell align="right"><Ltr>±{pct(d.backtestTotalError)}</Ltr></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{t(`forecastPage.models.${d.model}`)}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Card>
      )}
    </Stack>
  );
}