import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import MoreVert from '@mui/icons-material/MoreVert';
import PendingActionsOutlined from '@mui/icons-material/PendingActionsOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import PhoneInTalkRounded from '@mui/icons-material/PhoneInTalkRounded';
import Divider from '@mui/material/Divider';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useSocketEvent } from '../socket/SocketProvider';
import { useNotify } from '../components/NotificationCenter';
import KpiCard from '../components/KpiCard';
import StockAdvisorCard from '../components/StockAdvisorCard';
import { StatusChip, PriorityChip } from '../components/Chips';
import Ltr from '../components/Ltr';
import useNow from '../hooks/useNow';
import { ACTIVE, byPriority, formatMinutes, shortId, withFlags } from '../utils/orders';
import { routeLabel } from '../utils/dose';

// Pharmacist actions: verify the prescription, then compound it
const NEXT = { pending: 'verified', verified: 'preparing', preparing: 'ready' };

/** Clinical check before compounding: everything the pharmacist needs on one screen */
function VerifyDialog({ order: o, onClose, onVerify, onReject }) {
  const { t } = useTranslation();
  if (!o) return null;
  const p = o.patient;
  const per = o.dose.basis === 'bsa' ? '/m²' : o.dose.basis === 'weight' ? '/kg' : '';
  const row = (label, value) => (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600, textAlign: 'end' }}>{value}</Typography>
    </Stack>
  );
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {t('verify.title')}
        <Typography dir="ltr" sx={{ fontWeight: 700, fontSize: 18, textAlign: 'left' }}>{o.drugSnapshot.name}</Typography>
      </DialogTitle>
      <DialogContent>
        {o.entryType === 'verbal' && (
          <Alert severity="warning" icon={<PhoneInTalkRounded />} sx={{ mb: 2, borderRadius: 3 }}>
            {o.verbalOrder?.cosignedAt ? t('verify.verbalSigned', { doctor: o.prescriberName }) : t('verify.verbalUnsigned', { doctor: o.prescriberName })}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 4 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">{t('verify.patient')}</Typography>
            {row(t('ordersPage.col.patient'), <><span dir="auto">{p.name}</span> · <Ltr>{p.mrn}</Ltr></>)}
            {row(t('ordersPage.measurements'), <Ltr>{[p.weightKg && `${p.weightKg} kg`, p.heightCm && `${p.heightCm} cm`, p.bsa && `BSA ${p.bsa} m²`].filter(Boolean).join(' · ') || '—'}</Ltr>)}
            {row(t('orderForm.fields.allergies'), p.allergies?.length ? <Ltr>{p.allergies.join(', ')}</Ltr> : t('verify.none'))}
            {row(t('verify.prescriber'), o.prescriberName ?? '—')}
            {row(t('ordersPage.col.ward'), <Ltr>{o.departmentCode}</Ltr>)}
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">{t('verify.prescription')}</Typography>
            {row(t('ordersPage.prescribed'), <Ltr>{o.dose.prescribedValue} {o.dose.unit}{per}</Ltr>)}
            {row(t('orderForm.summary.calculated'), <Ltr>{o.dose.calculatedValue} {o.dose.unit}</Ltr>)}
            {row(t('orderForm.fields.route'), <Ltr>{routeLabel(o.route)}</Ltr>)}
            {o.diluent?.name && row(t('orderForm.fields.diluent'), <Ltr>{o.diluent.name}{o.diluent.volumeMl ? ` ${o.diluent.volumeMl} mL` : ''}</Ltr>)}
            {o.infusionDurationMin && row(t('orderForm.fields.duration'), <Ltr>{o.infusionDurationMin} min</Ltr>)}
            {row(t('queue.col.priority'), <PriorityChip priority={o.priority} />)}
          </Box>
        </Box>
        {o.notes && <Alert severity="info" icon={false} sx={{ mt: 2, borderRadius: 3 }}><span dir="auto">{o.notes}</span></Alert>}
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" color="text.secondary">{t('verify.checklist')}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button color="error" onClick={() => onReject(o)}>{t('verify.reject')}</Button>
        <Box sx={{ flex: 1 }} />
        <Button color="inherit" onClick={onClose}>{t('common.back')}</Button>
        <Button variant="contained" startIcon={<FactCheckOutlined />} onClick={() => onVerify(o)}>{t('verify.confirm')}</Button>
      </DialogActions>
    </Dialog>
  );
}
const NEW_HIGHLIGHT_MS = 10000;

function OrderRow({ o, isNew, canPrepare, busy, onAdvance, onMenu }) {
  const { t } = useTranslation();
  const next = NEXT[o.status];
  const late = o.isOverdue;

  return (
    <motion.div layout="position"
      initial={{ opacity: 0, y: -14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
      <Box sx={(th) => ({
        display: 'grid', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.4, mb: 0.75, borderRadius: 3,
        gridTemplateColumns: { xs: '1fr auto', md: '100px minmax(0,1fr) 44px 84px 104px 132px 30px' },
        bgcolor: isNew ? alpha(th.palette.primary.main, th.palette.mode === 'dark' ? 0.16 : 0.08) : 'subtle',
        border: 1, borderColor: isNew ? alpha(th.palette.primary.main, 0.4) : 'transparent',
        boxShadow: isNew ? `0 0 0 4px ${alpha(th.palette.primary.main, 0.08)}` : 'none',
        transition: 'background-color .8s, border-color .8s, box-shadow .8s',
      })}>
        <Box sx={{ display: { xs: 'none', md: 'block' } }}><PriorityChip priority={o.priority} /></Box>

        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Typography noWrap dir="ltr" sx={(th) => ({ fontWeight: 600, fontSize: 14, textAlign: th.direction === 'rtl' ? 'right' : 'left', minWidth: 0 })}>{o.drugSnapshot.name}</Typography>
            {isNew && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: '#fff', background: '#0F8B8D', padding: '1px 6px', borderRadius: 5 }}>
                {t('queue.new')}
              </motion.span>
            )}
          </Stack>
          <Typography noWrap variant="caption" color="text.secondary" component="div">
            <Ltr>{o.dose.calculatedValue} {o.dose.unit}</Ltr> · {o.route.replaceAll('_', ' ').toLowerCase()} · <Ltr>{o.patient.mrn}</Ltr> · <Ltr>{shortId(o.orderNumber)}</Ltr>
            {o.prescriberName && <> · {o.prescriberName}</>}
            {o.entryType === 'verbal' && <Box component="span" sx={{ color: 'warning.main', fontWeight: 700 }}> · {t('verbal.badge')}</Box>}
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}><Ltr>{o.departmentCode}</Ltr></Typography>

        <Tooltip title={o.status === 'ready' && o.minutesToExpiry != null ? t('queue.expiresIn', { time: formatMinutes(o.minutesToExpiry) }) : ''}>
          <Typography variant="body2" sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap', fontWeight: 600, color: late ? 'error.main' : o.expiringSoon || o.isExpired ? 'warning.main' : 'text.primary' }}>
            {(late || o.isExpired) && <WarningAmberRounded sx={{ fontSize: 16 }} />}
            <Ltr>{formatMinutes(o.minutesToDeadline)}</Ltr>
          </Typography>
        </Tooltip>

        <Box sx={{ display: { xs: 'none', md: 'block' } }}><StatusChip status={o.status} /></Box>

        <Box>
          {next && canPrepare ? (
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button fullWidth size="small" variant="contained" disabled={busy} onClick={() => onAdvance(o, next)} sx={{ py: 0.9 }}>
                {busy ? <CircularProgress size={18} color="inherit" /> : t(`queue.action.${next}`)}
              </Button>
            </motion.div>
          ) : (
            <Button fullWidth size="small" variant="outlined" disabled sx={{ py: 0.9, whiteSpace: 'nowrap', fontSize: 12.5 }}>
              {t(o.status === 'ready' ? 'queue.awaitingPickup' : `status.${o.status}`)}
            </Button>
          )}
        </Box>

        <IconButton size="small" onClick={(e) => onMenu(e.currentTarget, o)} sx={{ display: { xs: 'none', md: 'inline-flex' } }}>
          <MoreVert fontSize="small" />
        </IconButton>
      </Box>
    </motion.div>
  );
}

export default function QueuePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotify();
  const now = useNow(30000);

  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [newIds, setNewIds] = useState(() => new Set());
  const [menu, setMenu] = useState(null);          // { anchor, order }
  const [cancelling, setCancelling] = useState(null); // order being cancelled
  const [reason, setReason] = useState('');
  const [verifying, setVerifying] = useState(null); // order open in the verification dialog
  const timers = useRef([]);

  const canPrepare = user.role === 'pharmacist';

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/orders/queue');
      setOrders(data.orders);
      setError('');
    } catch (err) {
      setError(errorMessage(err, t('queue.loadError')));
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Merge one order into the list: add/replace if active, drop if finished
  const upsert = useCallback((o) => {
    setOrders((list) => {
      if (!list) return list;
      const rest = list.filter((x) => x._id !== o._id);
      return ACTIVE.includes(o.status) ? [...rest, o] : rest;
    });
  }, []);

  const markNew = useCallback((id) => {
    setNewIds((s) => new Set(s).add(id));
    timers.current.push(setTimeout(() => setNewIds((s) => { const n = new Set(s); n.delete(id); return n; }), NEW_HIGHLIGHT_MS));
  }, []);

  // ---- Live updates ----
  useSocketEvent('order:created', useCallback((o) => { upsert(o); markNew(o._id); }, [upsert, markNew]));
  useSocketEvent('order:updated', upsert);
  useSocketEvent('connect', load); // after a reconnect, resync anything we missed

  // ---- Actions ----
  const advance = async (o, status) => {
    setBusyId(o._id);
    try {
      const { data } = await api.patch(`/orders/${o._id}/status`, { status, version: o.__v });
      upsert(data.order);
      if (data.stock?.isLowStock) {
        notify({ kind: 'stock', title: t('toast.lowStock', { drug: data.stock.drug }), body: `${data.stock.after.toLocaleString('en-US')} ${data.stock.unit} · ${t('toast.reorderAt', { level: data.stock.reorderLevel })}` });
      }
    } catch (err) {
      notify({ kind: 'error', title: t('queue.actionFailed'), body: errorMessage(err) });
      if (err.response?.status === 409) load(); // someone else changed it: resync
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = async () => {
    const o = cancelling;
    setCancelling(null);
    setBusyId(o._id);
    try {
      const { data } = await api.patch(`/orders/${o._id}/status`, { status: 'cancelled', reason: reason.trim(), version: o.__v });
      upsert(data.order);
      const c = data.order.cancellation ?? {};
      notify({
        kind: c.wasCompounded ? 'warning' : 'info',
        title: t(c.rejectedByPharmacy ? 'verify.rejected' : 'queue.cancelled', { id: shortId(o.orderNumber) }),
        body: c.wasCompounded ? t('queue.wasteRecorded') : c.rejectedByPharmacy ? t('verify.doctorNotified') : '',
      });
    } catch (err) {
      notify({ kind: 'error', title: t('queue.actionFailed'), body: errorMessage(err) });
      load();
    } finally {
      setBusyId(null);
      setReason('');
    }
  };

  // ---- Derived view ----
  const view = useMemo(() => (orders ?? []).map((o) => withFlags(o, now)).sort(byPriority), [orders, now]);
  const count = (s) => view.filter((o) => o.status === s).length;
  const shown = tab === 'all' ? view : view.filter((o) => o.status === tab);
  const kpi = {
    pending: count('pending'),
    verified: count('verified'),
    emergency: view.filter((o) => o.status === 'pending' && o.priority === 'emergency').length,
    preparing: count('preparing'),
    ready: count('ready'),
    expiring: view.filter((o) => o.expiringSoon || o.isExpired).length,
    overdue: view.filter((o) => o.isOverdue).length,
  };

  return (
    <Stack spacing={2.5}>
      {/* KPIs */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        <KpiCard index={0} color="info" icon={<PendingActionsOutlined />} label={t('queue.kpi.toVerify')} value={kpi.pending}
          hint={kpi.emergency ? t('queue.kpi.emergency', { count: kpi.emergency }) : null} />
        <KpiCard index={1} color="warning" icon={<ScienceOutlined />} label={t('status.preparing')} value={kpi.preparing}
          hint={kpi.verified ? t('queue.kpi.verifiedWaiting', { count: kpi.verified }) : null} />
        <KpiCard index={2} color="success" icon={<TaskAltRounded />} label={t('queue.kpi.ready')} value={kpi.ready}
          hint={kpi.expiring ? t('queue.kpi.expiring', { count: kpi.expiring }) : null} />
        <KpiCard index={3} color="error" icon={<WarningAmberRounded />} label={t('queue.kpi.overdue')} value={kpi.overdue} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 300px' }, gap: 2.5, alignItems: 'start' }}>
        {/* Queue */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card sx={{ p: 2.5 }}>
            <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1">{t('nav.queue')}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{t('queue.sorted')}</Typography>
            </Stack>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}>
              <Tab value="all" label={`${t('queue.tabs.all')} · ${view.length}`} />
              {ACTIVE.map((s) => <Tab key={s} value={s} label={`${t(`status.${s}`)} · ${count(s)}`} />)}
            </Tabs>

            {/* Column headers (desktop) */}
            <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '100px minmax(0,1fr) 44px 84px 104px 132px 30px', gap: 1.25, px: 1.5, pb: 1, color: 'text.disabled', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              <span>{t('queue.col.priority')}</span><span>{t('queue.col.drug')}</span><span>{t('queue.col.ward')}</span>
              <span>{t('queue.col.due')}</span><span>{t('queue.col.status')}</span><span /><span />
            </Box>

            {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
            {!orders && !error && [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={58} sx={{ mb: 0.75, borderRadius: 3 }} />)}

            <AnimatePresence initial={false}>
              {shown.map((o) => (
                <OrderRow key={o._id} o={o} isNew={newIds.has(o._id)} canPrepare={canPrepare}
                  busy={busyId === o._id} onAdvance={(order, next) => (next === 'verified' ? setVerifying(order) : advance(order, next))}
                  onMenu={(anchor, order) => setMenu({ anchor, order })} />
              ))}
            </AnimatePresence>

            {orders && shown.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                  <TaskAltRounded sx={{ fontSize: 44, color: 'success.main', mb: 1 }} />
                  <Typography>{t('queue.empty')}</Typography>
                </Box>
              </motion.div>
            )}
          </Card>
        </motion.div>

        {/* AI panel */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <StockAdvisorCard />
        </motion.div>
      </Box>

      <VerifyDialog order={verifying} onClose={() => setVerifying(null)}
        onVerify={(o) => { setVerifying(null); advance(o, 'verified'); }}
        onReject={(o) => { setVerifying(null); setCancelling(o); }} />

      {/* Row menu */}
      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setCancelling(menu.order); setMenu(null); }} sx={{ color: 'error.main' }}>
          {menu?.order.status === 'pending' && canPrepare ? t('verify.rejectMenu') : t('queue.cancelOrder')}
        </MenuItem>
      </Menu>

      {/* Cancel dialog: reason is mandatory (audit trail) */}
      <Dialog open={!!cancelling} onClose={() => setCancelling(null)} fullWidth maxWidth="xs">
        <DialogTitle>{cancelling?.status === 'pending' && canPrepare ? t('verify.rejectTitle') : t('queue.cancelTitle')}</DialogTitle>
        <DialogContent>
          {cancelling && ['preparing', 'ready'].includes(cancelling.status) && (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>{t('queue.cancelWasteWarning')}</Alert>
          )}
          <TextField autoFocus multiline minRows={2} label={t('queue.reason')} value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelling(null)} color="inherit">{t('common.back')}</Button>
          <Button onClick={confirmCancel} color="error" variant="contained" disabled={reason.trim().length < 3}>
            {cancelling?.status === 'pending' && canPrepare ? t('verify.reject') : t('queue.confirmCancel')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}