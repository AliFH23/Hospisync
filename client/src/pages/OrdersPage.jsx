import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TablePagination from '@mui/material/TablePagination';
import Drawer from '@mui/material/Drawer';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useSocketEvent } from '../socket/SocketProvider';
import { StatusChip, PriorityChip } from '../components/Chips';
import Ltr from '../components/Ltr';
import { routeLabel } from '../utils/dose';
import { STATUS_COLOR } from '../theme/tokens';

const STATUSES = ['active', 'pending', 'preparing', 'ready', 'delivered', 'cancelled'];
const PRIORITIES = ['emergency', 'urgent', 'routine'];
const EMPTY = { q: '', status: '', department: '', priority: '', from: '', to: '' };

/** Timeline of who did what, from the order's status history */
function OrderDetail({ id, onClose }) {
  const { t, i18n } = useTranslation();
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const fmt = useMemo(() => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [i18n.language]);

  useEffect(() => {
    setO(null);
    api.get(`/orders/${id}`).then(({ data }) => setO(data.order)).catch((err) => setError(errorMessage(err)));
  }, [id]);

  const row = (label, value) => (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, py: 0.6 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'end' }}>{value}</Typography>
    </Stack>
  );

  return (
    <Box sx={{ width: { xs: '100vw', sm: 420 }, p: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>{t('ordersPage.detail')}</Typography>
        <IconButton onClick={onClose}><CloseRounded /></IconButton>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {!o && !error && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={40} />)}
      {o && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Typography variant="caption" color="text.secondary"><Ltr>{o.orderNumber}</Ltr></Typography>
          <Typography dir="ltr" sx={{ fontSize: 20, fontWeight: 700, textAlign: 'left' }}>{o.drugSnapshot.name}</Typography>
          <Stack direction="row" spacing={1} sx={{ my: 1.5 }}>
            <PriorityChip priority={o.priority} /><StatusChip status={o.status} />
          </Stack>

          {row(t('ordersPage.col.patient'), <><span dir="auto">{o.patient.name}</span> · <Ltr>{o.patient.mrn}</Ltr></>)}
          {(o.patient.weightKg || o.patient.heightCm) && row(t('ordersPage.measurements'),
            <Ltr>{[o.patient.weightKg && `${o.patient.weightKg} kg`, o.patient.heightCm && `${o.patient.heightCm} cm`, o.patient.bsa && `BSA ${o.patient.bsa} m²`].filter(Boolean).join(' · ')}</Ltr>)}
          {row(t('ordersPage.prescribed'), <Ltr>{o.dose.prescribedValue} {o.dose.unit}{o.dose.basis === 'bsa' ? '/m²' : o.dose.basis === 'weight' ? '/kg' : ''}</Ltr>)}
          {row(t('orderForm.summary.calculated'), <Ltr>{o.dose.calculatedValue} {o.dose.unit}</Ltr>)}
          {row(t('orderForm.fields.route'), <Ltr>{routeLabel(o.route)}</Ltr>)}
          {o.diluent?.name && row(t('orderForm.fields.diluent'), <Ltr>{o.diluent.name}{o.diluent.volumeMl ? ` ${o.diluent.volumeMl} mL` : ''}</Ltr>)}
          {row(t('ordersPage.col.ward'), <Ltr>{o.departmentCode}</Ltr>)}
          {row(t('orderForm.fields.requiredBy'), <Ltr>{fmt.format(new Date(o.requiredBy))}</Ltr>)}
          {o.notes && <Alert severity="info" icon={false} sx={{ mt: 1, borderRadius: 3 }}><span dir="auto">{o.notes}</span></Alert>}
          {o.status === 'cancelled' && (
            <Alert severity={o.cancellation?.wasCompounded ? 'warning' : 'error'} sx={{ mt: 1.5, borderRadius: 3 }}>
              <span dir="auto">{o.cancellation?.reason}</span>
              {o.cancellation?.wasCompounded && <Typography variant="caption" component="div" sx={{ fontWeight: 700 }}>{t('queue.wasteRecorded')}</Typography>}
            </Alert>
          )}

          <Divider sx={{ my: 2.5 }} />
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{t('ordersPage.history')}</Typography>
          <Box sx={{ position: 'relative' }}>
            {o.statusHistory.map((h, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}>
                <Box sx={{ display: 'flex', gap: 1.5, pb: 2, position: 'relative' }}>
                  {/* connector line */}
                  {i < o.statusHistory.length - 1 && <Box sx={{ position: 'absolute', top: 14, bottom: 0, insetInlineStart: 5, width: 2, bgcolor: 'divider' }} />}
                  <Box sx={{ width: 12, height: 12, mt: 0.5, borderRadius: '50%', flex: 'none', bgcolor: `${STATUS_COLOR[h.to]}.main`, position: 'relative' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{t(`status.${h.to}`)}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {h.by?.fullName ?? '—'} · {t(`roles.${h.role}`)} · <Ltr>{fmt.format(new Date(h.at))}</Ltr>
                    </Typography>
                    {h.note && <Typography variant="caption" component="div" dir="auto" sx={{ mt: 0.25 }}>{h.note}</Typography>}
                  </Box>
                </Box>
              </motion.div>
            ))}
          </Box>
        </motion.div>
      )}
    </Box>
  );
}

export default function OrdersPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const departments = user.hospital?.departments ?? [];

  const [filters, setFilters] = useState(EMPTY);
  const [search, setSearch] = useState('');      // what's typed; copied into filters.q after a pause
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const debounce = useRef();
  const liveDebounce = useRef();

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [i18n.language]);

  // Typing in the search box: wait 400 ms, then search (and only 2+ characters)
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const q = search.trim();
      setFilters((f) => (f.q === (q.length >= 2 ? q : '') ? f : { ...f, q: q.length >= 2 ? q : '' }));
      setPage(0);
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
      if (params.from) params.from = new Date(`${params.from}T00:00:00`).toISOString();
      if (params.to) params.to = new Date(`${params.to}T23:59:59`).toISOString();
      const { data: d } = await api.get('/orders', { params });
      setData(d);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, page, rowsPerPage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(liveDebounce.current), []);

  // Live: refresh the first page when orders change (newest are on top)
  const live = useCallback(() => {
    if (page !== 0) return;
    clearTimeout(liveDebounce.current);
    liveDebounce.current = setTimeout(load, 800);
  }, [page, load]);
  useSocketEvent('order:created', live);
  useSocketEvent('order:updated', live);

  const setFilter = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(0); };
  const active = Object.values(filters).some(Boolean) || search;
  const clear = () => { setFilters(EMPTY); setSearch(''); setPage(0); };

  const select = (k, label, options) => (
    <TextField select size="small" fullWidth={false} label={label} value={filters[k]} onChange={setFilter(k)} sx={{ minWidth: 150 }}>
      <MenuItem value="">{t('ordersPage.all')}</MenuItem>
      {options}
    </TextField>
  );

  return (
    <Stack spacing={2.5}>
      {/* Filters: one row above the table */}
      <Card sx={{ p: 2 }}>
        <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" fullWidth={false} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ordersPage.search')}
            sx={{ minWidth: 240, flex: { xs: '1 1 100%', md: '0 1 280px' } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
          {select('status', t('ordersPage.col.status'), STATUSES.map((s) => <MenuItem key={s} value={s}>{s === 'active' ? t('ward.tabs.active') : t(`status.${s}`)}</MenuItem>))}
          {departments.length > 0 && select('department', t('ordersPage.col.ward'), departments.map((d) => <MenuItem key={d._id} value={d._id}><Ltr>{d.code}</Ltr>&nbsp;· {d.name}</MenuItem>))}
          {select('priority', t('queue.col.priority'), PRIORITIES.map((p) => <MenuItem key={p} value={p}>{t(`priority.${p}`)}</MenuItem>))}
          <TextField size="small" fullWidth={false} type="date" label={t('ordersPage.from')} value={filters.from} onChange={setFilter('from')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }} />
          <TextField size="small" fullWidth={false} type="date" label={t('ordersPage.to')} value={filters.to} onChange={setFilter('to')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: 'ltr' } }} />
          <AnimatePresence>
            {active && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <Button color="inherit" startIcon={<FilterAltOffOutlined />} onClick={clear}>{t('ordersPage.clear')}</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Stack>
      </Card>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card sx={{ p: { xs: 1, md: 1.5 } }}>
          {error && <Alert severity="error" sx={{ m: 1, borderRadius: 3 }}>{error}</Alert>}
          <Box sx={{ overflowX: 'auto', opacity: loading && data ? 0.55 : 1, transition: 'opacity .2s' }}>
            <Table size="small" sx={{ minWidth: 900, '& td, & th': { borderColor: 'divider', py: 1.2 }, '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('ordersPage.col.order')}</TableCell>
                  <TableCell>{t('ordersPage.col.created')}</TableCell>
                  <TableCell>{t('ordersPage.col.drug')}</TableCell>
                  <TableCell>{t('ordersPage.col.patient')}</TableCell>
                  <TableCell>{t('ordersPage.col.ward')}</TableCell>
                  <TableCell>{t('queue.col.priority')}</TableCell>
                  <TableCell>{t('ordersPage.col.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!data && [0, 1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}><TableCell colSpan={7}><Skeleton height={32} /></TableCell></TableRow>
                ))}
                {data?.orders.map((o) => (
                  <TableRow key={o._id} hover onClick={() => setOpenId(o._id)} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}><Ltr>{o.orderNumber}</Ltr></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}><Ltr>{dateFmt.format(new Date(o.createdAt))}</Ltr></TableCell>
                    <TableCell>
                      <Typography dir="ltr" sx={{ fontWeight: 600, fontSize: 14, textAlign: 'left' }}>{o.drugSnapshot.name}</Typography>
                      <Typography variant="caption" color="text.secondary"><Ltr>{o.dose.calculatedValue} {o.dose.unit} · {routeLabel(o.route)}</Ltr></Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2"><span dir="auto">{o.patient.name}</span></Typography>
                      <Typography variant="caption" color="text.secondary"><Ltr>{o.patient.mrn}</Ltr></Typography>
                    </TableCell>
                    <TableCell><Ltr>{o.departmentCode}</Ltr></TableCell>
                    <TableCell><PriorityChip priority={o.priority} /></TableCell>
                    <TableCell><StatusChip status={o.status} /></TableCell>
                  </TableRow>
                ))}
                {data && data.orders.length === 0 && (
                  <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>{t('ordersPage.empty')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
          {data && (
            <TablePagination component="div" count={data.total} page={page} rowsPerPage={rowsPerPage} rowsPerPageOptions={[20, 50, 100]}
              onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
              labelRowsPerPage={t('ordersPage.perPage')}
              labelDisplayedRows={({ from, to, count }) => `${from.toLocaleString('en-US')}–${to.toLocaleString('en-US')} / ${count.toLocaleString('en-US')}`} />
          )}
        </Card>
      </motion.div>

      <Drawer anchor="right" open={!!openId} onClose={() => setOpenId(null)}>
        {openId && <OrderDetail id={openId} onClose={() => setOpenId(null)} />}
      </Drawer>
    </Stack>
  );
}