import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import { alpha } from '@mui/material/styles';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import api, { errorMessage } from '../api/client';
import { useSocketEvent } from '../socket/SocketProvider';
import KpiCard from '../components/KpiCard';
import Ltr from '../components/Ltr';

const STATUS = {
  critical: { color: 'error', icon: ErrorRounded },
  reorder: { color: 'warning', icon: WarningAmberRounded },
  ok: { color: 'success', icon: CheckCircleRounded },
};
const LEAD_TIMES = [1, 3, 5, 7];
const HORIZONS = [7, 14, 28];
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

/** Status = color + icon + word, never color alone */
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const { color, icon: Icon } = STATUS[status];
  return (
    <Box sx={(th) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 2, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
      color: th.palette[color].main, bgcolor: alpha(th.palette[color].main, th.palette.mode === 'dark' ? 0.16 : 0.1) })}>
      <Icon sx={{ fontSize: 15 }} />{t(`stock.${status}`)}
    </Box>
  );
}

/** Days of cover as a bar on a 0..horizon scale, with a tick at the supplier lead time */
function CoverBar({ days, horizon, leadTime, status }) {
  const { t } = useTranslation();
  const pct = days == null ? 100 : Math.min(100, (days / horizon) * 100);
  const lead = Math.min(100, (leadTime / horizon) * 100);
  const color = STATUS[status].color;
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
        <Ltr>{days == null ? `>${horizon}` : days} d</Ltr>
      </Typography>
      <Tooltip title={t('stockPage.leadMarker', { days: leadTime })}>
        <Box sx={{ position: 'relative', height: 6, borderRadius: 3, bgcolor: 'divider' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, borderRadius: 3 }}>
            <Box sx={{ height: '100%', borderRadius: 3, bgcolor: `${color}.main` }} />
          </motion.div>
          <Box sx={{ position: 'absolute', top: -3, bottom: -3, width: 2, borderRadius: 1, bgcolor: 'text.primary', insetInlineStart: `calc(${lead}% - 1px)` }} />
        </Box>
      </Tooltip>
    </Box>
  );
}

function exportCsv(data) {
  const rows = data.items.filter((i) => i.recommendedOrder > 0);
  const header = ['Code', 'Drug', 'Status', 'On hand', 'Unit', 'Avg per day', 'Days of cover', 'Runs out', 'Recommended order'];
  const lines = rows.map((i) => [i.code, i.name, i.status, i.onHand, i.unit, i.avgDailyDemand, i.daysOfCover ?? '', i.stockoutDate ?? '', i.recommendedOrder]);
  const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); // BOM so Excel reads UTF-8
  const a = Object.assign(document.createElement('a'), { href: url, download: `hospisync-purchase-order-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

export default function StockPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [leadTime, setLeadTime] = useState(3);
  const [horizon, setHorizon] = useState(14);
  const debounce = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get('/ai/stock', { params: { leadTimeDays: leadTime, horizon } });
      setData(d);
      setError('');
    } catch (err) {
      setError(err.response?.status >= 500 || !err.response ? t('stock.offline') : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [leadTime, horizon, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(debounce.current), []);

  // Stock changes when a pharmacist starts preparing → refresh (debounced, many can happen at once)
  const soon = useCallback(() => { clearTimeout(debounce.current); debounce.current = setTimeout(load, 1500); }, [load]);
  useSocketEvent('order:updated', useCallback((o) => o.status === 'preparing' && soon(), [soon]));
  useSocketEvent('ai:stock-alert', soon);

  const counts = data?.counts ?? { critical: 0, reorder: 0, ok: 0 };
  const toOrder = data?.items.filter((i) => i.recommendedOrder > 0).length ?? 0;

  return (
    <Stack spacing={2.5}>
      {/* Filters: one row, above everything they scope */}
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('stockPage.leadTime')}</Typography>
          <ToggleButtonGroup size="small" exclusive value={leadTime} onChange={(_, v) => v && setLeadTime(v)} color="primary">
            {LEAD_TIMES.map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}><Ltr>{d} d</Ltr></ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('stockPage.horizon')}</Typography>
          <ToggleButtonGroup size="small" exclusive value={horizon} onChange={(_, v) => v && setHorizon(v)} color="primary">
            {HORIZONS.map((d) => <ToggleButton key={d} value={d} sx={{ px: 1.5 }}><Ltr>{d} d</Ltr></ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('stockPage.refresh')}>
          <span><IconButton onClick={load} disabled={loading}><RefreshRounded /></IconButton></span>
        </Tooltip>
        <Button variant="contained" startIcon={<FileDownloadOutlined />} disabled={!toOrder} onClick={() => exportCsv(data)}>
          {t('stockPage.export', { count: toOrder })}
        </Button>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
        <KpiCard index={0} color="error" icon={<ErrorRounded />} label={t('stockPage.kpi.critical')} value={counts.critical} />
        <KpiCard index={1} color="warning" icon={<WarningAmberRounded />} label={t('stockPage.kpi.reorder')} value={counts.reorder} />
        <KpiCard index={2} color="success" icon={<CheckCircleRounded />} label={t('stockPage.kpi.ok')} value={counts.ok} />
      </Box>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card sx={{ p: { xs: 1.5, md: 2.5 } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2, px: { xs: 1, md: 0 } }}>
            <Box sx={{ width: 28, height: 28, borderRadius: 2, display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg,#3BC0B6,#6A7FDB)' }}>
              <AutoAwesomeRounded sx={{ fontSize: 17 }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1">{t('stockPage.title')}</Typography>
              <Typography variant="caption" color="text.secondary">{t('stockPage.subtitle', { days: horizon })}</Typography>
            </Box>
          </Stack>

          {error && <Alert severity="info" variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>{error}</Alert>}
          {!data && loading && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={52} sx={{ mb: 1, borderRadius: 2 }} />)}

          {data && (
            // Hold the previous result at lower opacity while refetching: no layout jump
            <Box sx={{ overflowX: 'auto', opacity: loading ? 0.55 : 1, transition: 'opacity .2s' }}>
              <Table size="small" sx={{ minWidth: 820, '& td, & th': { borderColor: 'divider', py: 1.25 }, '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('stockPage.col.drug')}</TableCell>
                    <TableCell>{t('stockPage.col.status')}</TableCell>
                    <TableCell align="right">{t('stockPage.col.onHand')}</TableCell>
                    <TableCell align="right">{t('stockPage.col.perDay')}</TableCell>
                    <TableCell>{t('stockPage.col.cover')}</TableCell>
                    <TableCell>{t('stockPage.col.runsOut')}</TableCell>
                    <TableCell align="right">{t('stockPage.col.reorderPoint')}</TableCell>
                    <TableCell align="right">{t('stockPage.col.order')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.map((i, idx) => (
                    <TableRow key={i.drugId} component={motion.tr} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 * idx }}
                      sx={(th) => ({ bgcolor: i.status === 'critical' ? alpha(th.palette.error.main, th.palette.mode === 'dark' ? 0.07 : 0.035) : 'transparent' })}>
                      <TableCell>
                        <Typography dir="ltr" sx={{ fontWeight: 600, fontSize: 14, textAlign: 'left' }}>{i.name}</Typography>
                        <Typography variant="caption" color="text.secondary"><Ltr>{i.code}</Ltr></Typography>
                      </TableCell>
                      <TableCell><StatusBadge status={i.status} /></TableCell>
                      <TableCell align="right"><Ltr>{fmt(i.onHand)} {i.unit}</Ltr></TableCell>
                      <TableCell align="right"><Ltr>{fmt(i.avgDailyDemand)} {i.unit}</Ltr></TableCell>
                      <TableCell><CoverBar days={i.daysOfCover} horizon={data.horizonDays} leadTime={data.leadTimeDays} status={i.status} /></TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {i.stockoutDate ? <Ltr>{i.stockoutDate}</Ltr> : <Typography variant="body2" color="text.secondary">{t('stockPage.notInHorizon')}</Typography>}
                      </TableCell>
                      <TableCell align="right"><Ltr>{fmt(i.reorderPoint)}</Ltr></TableCell>
                      <TableCell align="right">
                        {i.recommendedOrder > 0
                          ? <Typography sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}><Ltr>{fmt(i.recommendedOrder)} {i.unit}</Ltr></Typography>
                          : <Typography variant="body2" color="text.secondary">—</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          {data && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2, px: { xs: 1, md: 0 }, lineHeight: 1.7 }}>
              {t('stockPage.explain', { lead: data.leadTimeDays, days: data.horizonDays })}
            </Typography>
          )}
        </Card>
      </motion.div>
    </Stack>
  );
}