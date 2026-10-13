import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import AddRounded from '@mui/icons-material/AddRounded';
import MoreVert from '@mui/icons-material/MoreVert';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import InventoryRounded from '@mui/icons-material/InventoryRounded';
import api, { errorMessage } from '../api/client';
import { useSocketEvent } from '../socket/SocketProvider';
import { useNotify } from '../components/NotificationCenter';
import KpiCard from '../components/KpiCard';
import { StatusChip, PriorityChip } from '../components/Chips';
import Ltr from '../components/Ltr';
import useNow from '../hooks/useNow';
import { ACTIVE, byPriority, formatMinutes, shortId, withFlags } from '../utils/orders';
import { routeLabel } from '../utils/dose';

const STEPS = ['pending', 'preparing', 'ready', 'delivered'];
const DAY = 24 * 3600 * 1000;
const NEW_HIGHLIGHT_MS = 10000;

/** 4-step progress: Sent → Compounding → Ready → Received, the bar slides as the order moves */
function Progress({ status }) {
  const { t } = useTranslation();
  const idx = STEPS.indexOf(status);
  return (
    <Box sx={{ position: 'relative', mt: 2, mb: 0.5 }}>
      <Box sx={{ position: 'absolute', top: 6, insetInline: '12.5%', height: 3, borderRadius: 2, bgcolor: 'divider' }} />
      <Box sx={{ position: 'absolute', top: 6, insetInlineStart: '12.5%', width: '75%', height: 3 }}>
        <motion.div initial={false} animate={{ scaleX: Math.max(idx, 0) / 3 }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{ height: '100%', borderRadius: 2, transformOrigin: 'var(--origin)', background: 'var(--bar)' }} />
      </Box>
      <Box sx={(th) => ({ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', position: 'relative',
        '--bar': th.palette.primary.main, '--origin': th.direction === 'rtl' ? 'right' : 'left' })}>
        {STEPS.map((s, i) => {
          const done = i <= idx;
          const current = i === idx;
          return (
            <Box key={s} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ position: 'relative', width: 15, height: 15 }}>
                <Box sx={(th) => ({ position: 'absolute', inset: 0, borderRadius: '50%', transition: 'all .4s',
                  bgcolor: done ? 'primary.main' : 'background.paper', border: `2px solid ${done ? th.palette.primary.main : th.palette.divider}` })} />
                {current && s !== 'delivered' && (
                  <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--bar)' }}
                    animate={{ scale: [1, 2.2], opacity: [0.45, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
                )}
              </Box>
              <Typography variant="caption" sx={{ fontWeight: current ? 700 : 500, color: done ? 'text.primary' : 'text.disabled', textAlign: 'center', lineHeight: 1.2 }}>
                {t(`ward.steps.${s}`)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function WardOrderCard({ o, isNew, busy, onReceive, onMenu }) {
  const { t } = useTranslation();
  const ready = o.status === 'ready';
  const active = ACTIVE.includes(o.status);

  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <Card sx={(th) => {
        const accent = ready ? th.palette.success.main : isNew ? th.palette.primary.main : null;
        return {
          p: 2.25, height: '100%', position: 'relative', overflow: 'hidden',
          border: '1.5px solid', borderColor: accent ? alpha(accent, 0.55) : 'transparent',
          boxShadow: accent ? `0 0 0 4px ${alpha(accent, 0.08)}` : undefined,
          transition: 'border-color .6s, box-shadow .6s',
        };
      }}>
        {/* Header: priority, drug, dose, timer */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <PriorityChip priority={o.priority} />
              {!active && <StatusChip status={o.status} />}
              {isNew && <Typography component="span" sx={{ fontSize: 10, fontWeight: 800, color: '#fff', bgcolor: 'primary.main', px: 0.75, borderRadius: 1.25 }}>{t('queue.new')}</Typography>}
            </Stack>
            <Typography noWrap dir="ltr" sx={{ fontWeight: 700, fontSize: 16, textAlign: 'left' }}>{o.drugSnapshot.name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              <Ltr>{o.dose.calculatedValue} {o.dose.unit}</Ltr> · <Ltr>{routeLabel(o.route)}</Ltr>
            </Typography>
          </Box>

          {active && (
            <Box sx={{ textAlign: 'end', flex: 'none' }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', color: o.isOverdue ? 'error.main' : 'text.primary', display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                {o.isOverdue && <WarningAmberRounded sx={{ fontSize: 17 }} />}
                <Ltr>{formatMinutes(Math.abs(o.minutesToDeadline))}</Ltr>
              </Typography>
              <Typography variant="caption" color={o.isOverdue ? 'error.main' : 'text.secondary'}>{t(o.isOverdue ? 'ward.overdue' : 'ward.due')}</Typography>
            </Box>
          )}
          {active && (
            <IconButton size="small" onClick={(e) => onMenu(e.currentTarget, o)} sx={{ mt: -0.5 }}><MoreVert fontSize="small" /></IconButton>
          )}
        </Stack>

        {/* Patient line */}
        <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ mt: 1 }}>
          <span dir="auto">{o.patient.name}</span> · <Ltr>{o.patient.mrn}</Ltr> · <Ltr>{shortId(o.orderNumber)}</Ltr>
        </Typography>

        {o.status !== 'cancelled' && <Progress status={o.status} />}
        {o.status === 'cancelled' && o.cancellation?.reason && (
          <Typography variant="caption" color="error.main" component="div" sx={{ mt: 1.5 }} dir="auto">{o.cancellation.reason}</Typography>
        )}

        {/* Ready: beyond-use countdown + receive */}
        <AnimatePresence initial={false}>
          {ready && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 2 }}>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: o.isExpired ? 'error.main' : o.expiringSoon ? 'warning.main' : 'success.main' }}>
                  {o.isExpired ? t('ward.expired') : <>{t('ward.useWithin')} <Ltr>{formatMinutes(o.minutesToExpiry)}</Ltr></>}
                </Typography>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button variant="contained" color="success" disabled={busy || o.isExpired} onClick={() => onReceive(o)}
                    startIcon={!busy && <TaskAltRounded />} sx={{ whiteSpace: 'nowrap' }}>
                    {busy ? <CircularProgress size={20} color="inherit" /> : t('ward.receive')}
                  </Button>
                </motion.div>
              </Stack>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export default function WardPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow(30000);

  const [active, setActive] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('active');
  const [busyId, setBusyId] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const [receiving, setReceiving] = useState(null);
  const [menu, setMenu] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const timers = useRef([]);

  const markNew = useCallback((id) => {
    setNewIds((s) => new Set(s).add(id));
    timers.current.push(setTimeout(() => setNewIds((s) => { const n = new Set(s); n.delete(id); return n; }), NEW_HIGHLIGHT_MS));
  }, []);

  const load = useCallback(async () => {
    try {
      const since = new Date(Date.now() - DAY).toISOString();
      const [a, d] = await Promise.all([
        api.get('/orders', { params: { status: 'active', limit: 100 } }),
        api.get('/orders', { params: { status: 'delivered,cancelled', from: since, limit: 50 } }),
      ]);
      setActive(a.data.orders);
      setDone(d.data.orders);
      setError('');
    } catch (err) {
      setError(errorMessage(err, t('ward.loadError')));
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Just created from the form → highlight it once, then clear the router state
  useEffect(() => {
    const id = location.state?.created;
    if (id) { markNew(id); navigate('.', { replace: true, state: null }); }
  }, [location.state, markNew, navigate]);

  // Active orders stay in "active"; finished ones move to the 24h list
  const upsert = useCallback((o) => {
    setActive((list) => list && (ACTIVE.includes(o.status) ? [...list.filter((x) => x._id !== o._id), o] : list.filter((x) => x._id !== o._id)));
    if (!ACTIVE.includes(o.status)) setDone((list) => list && [o, ...list.filter((x) => x._id !== o._id)]);
  }, []);

  // ---- Live: the server only sends this ward's orders to a nurse ----
  useSocketEvent('order:created', useCallback((o) => { upsert(o); markNew(o._id); }, [upsert, markNew]));
  useSocketEvent('order:updated', upsert);
  useSocketEvent('connect', load);

  const patch = async (o, body, onOk) => {
    setBusyId(o._id);
    try {
      const { data } = await api.patch(`/orders/${o._id}/status`, { ...body, version: o.__v });
      upsert(data.order);
      onOk?.(data.order);
    } catch (err) {
      notify({ kind: 'error', title: t('queue.actionFailed'), body: errorMessage(err) });
      if ([409, 422].includes(err.response?.status)) load();
    } finally {
      setBusyId(null);
    }
  };

  const confirmReceive = () => {
    const o = receiving;
    setReceiving(null);
    patch(o, { status: 'delivered' }, () => notify({ kind: 'success', title: t('ward.received', { drug: o.drugSnapshot.name }), body: `${shortId(o.orderNumber)} · ${o.patient.mrn}` }));
  };

  const confirmCancel = () => {
    const o = cancelling;
    setCancelling(null);
    patch(o, { status: 'cancelled', reason: reason.trim() }, (u) => notify({
      kind: u.cancellation?.wasCompounded ? 'warning' : 'info',
      title: t('queue.cancelled', { id: shortId(o.orderNumber) }),
      body: u.cancellation?.wasCompounded ? t('queue.wasteRecorded') : '',
    }));
    setReason('');
  };

  // ---- Derived ----
  const view = useMemo(() => (active ?? []).map((o) => withFlags(o, now)).sort(byPriority), [active, now]);
  const readyList = view.filter((o) => o.status === 'ready');
  const shown = tab === 'active' ? view : tab === 'ready' ? readyList : (done ?? []);
  const receivedToday = (done ?? []).filter((o) => o.status === 'delivered').length;
  const loading = !active && !error;

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        <KpiCard index={0} color="info" icon={<HourglassTopRounded />} label={t('ward.kpi.active')} value={view.length} />
        <KpiCard index={1} color="success" icon={<LocalShippingOutlined />} label={t('ward.kpi.ready')} value={readyList.length} />
        <KpiCard index={2} color="error" icon={<WarningAmberRounded />} label={t('ward.kpi.overdue')} value={view.filter((o) => o.isOverdue).length} />
        <KpiCard index={3} color="secondary" icon={<InventoryRounded />} label={t('ward.kpi.received')} value={receivedToday} />
      </Box>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 1, gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1">{t('nav.wardOrders')}</Typography>
            <Box sx={{ flex: 1 }} />
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
              <Button component={Link} to="/ward/new" variant="contained" startIcon={<AddRounded />}>{t('nav.newOrder')}</Button>
            </motion.div>
          </Stack>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}>
            <Tab value="active" label={`${t('ward.tabs.active')} · ${view.length}`} />
            <Tab value="ready" label={`${t('ward.tabs.ready')} · ${readyList.length}`} />
            <Tab value="done" label={`${t('ward.tabs.done')} · ${done?.length ?? 0}`} />
          </Tabs>

          {error && <Alert severity="error" sx={{ borderRadius: 3, mb: 2 }}>{error}</Alert>}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
            {loading && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={190} sx={{ borderRadius: 4 }} />)}
            <AnimatePresence initial={false}>
              {shown.map((o) => (
                <WardOrderCard key={o._id} o={o} isNew={newIds.has(o._id)} busy={busyId === o._id}
                  onReceive={setReceiving} onMenu={(anchor, order) => setMenu({ anchor, order })} />
              ))}
            </AnimatePresence>
          </Box>

          {!loading && shown.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                <TaskAltRounded sx={{ fontSize: 44, color: 'success.main', mb: 1 }} />
                <Typography sx={{ mb: 2 }}>{t(`ward.empty.${tab}`)}</Typography>
                {tab === 'active' && <Button component={Link} to="/ward/new" variant="outlined" startIcon={<AddRounded />}>{t('nav.newOrder')}</Button>}
              </Box>
            </motion.div>
          )}
        </Card>
      </motion.div>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setCancelling(menu.order); setMenu(null); }} sx={{ color: 'error.main' }}>{t('queue.cancelOrder')}</MenuItem>
      </Menu>

      {/* Bedside check before receiving */}
      <Dialog open={!!receiving} onClose={() => setReceiving(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('ward.receiveTitle')}</DialogTitle>
        <DialogContent>
          {receiving && (
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'subtle', mb: 2 }}>
              <Typography dir="ltr" sx={{ fontWeight: 700, textAlign: 'left' }}>{receiving.drugSnapshot.name}</Typography>
              <Typography variant="body2"><Ltr>{receiving.dose.calculatedValue} {receiving.dose.unit} · {routeLabel(receiving.route)}</Ltr></Typography>
              <Typography variant="body2" color="text.secondary"><span dir="auto">{receiving.patient.name}</span> · <Ltr>{receiving.patient.mrn}</Ltr></Typography>
            </Box>
          )}
          <Alert severity="info" sx={{ borderRadius: 3 }}>{t('ward.receiveCheck')}</Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setReceiving(null)}>{t('common.back')}</Button>
          <Button variant="contained" color="success" onClick={confirmReceive}>{t('ward.receiveConfirm')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!cancelling} onClose={() => setCancelling(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('queue.cancelTitle')}</DialogTitle>
        <DialogContent>
          {cancelling && ['preparing', 'ready'].includes(cancelling.status) && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>{t('queue.cancelWasteWarning')}</Alert>
          )}
          <TextField autoFocus fullWidth multiline minRows={2} label={t('queue.reason')} value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCancelling(null)}>{t('common.back')}</Button>
          <Button color="error" variant="contained" disabled={reason.trim().length < 3} onClick={confirmCancel}>{t('queue.confirmCancel')}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}