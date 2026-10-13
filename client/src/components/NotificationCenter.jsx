import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlineRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineRounded';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../auth/AuthContext';
import { useSocketEvent } from '../socket/SocketProvider';
import { shortId } from '../utils/orders';

const ICONS = { warning: TimerOutlined, error: ErrorOutline, stock: Inventory2Outlined, success: CheckCircleOutline, info: NotificationsActiveOutlined };
const COLOR = { warning: 'warning', error: 'error', stock: 'warning', success: 'success', info: 'primary' };
const LIFETIME = 9000;

const NotifyContext = createContext(() => {});
export const useNotify = () => useContext(NotifyContext);

function Toast({ item, onClose }) {
  const Icon = ICONS[item.kind] ?? ICONS.info;
  const color = COLOR[item.kind] ?? 'primary';
  return (
    <motion.div layout initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
      <Paper elevation={6} sx={(t) => ({ width: 360, maxWidth: 'calc(100vw - 32px)', p: 1.75, display: 'flex', gap: 1.5, borderRadius: 3.5, overflow: 'hidden', position: 'relative', borderInlineStart: `4px solid ${t.palette[color].main}` })}>
        <Box sx={(t) => ({ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center', flex: 'none', color: t.palette[color].main, bgcolor: alpha(t.palette[color].main, 0.12) })}>
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography dir="auto" sx={{ fontSize: 14, fontWeight: 600, textAlign: 'start' }}>{item.title}</Typography>
          {item.body && <Typography dir="auto" variant="body2" color="text.secondary" sx={{ mt: 0.25, textAlign: 'start' }}>{item.body}</Typography>}
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ alignSelf: 'flex-start', mt: -0.5 }}><CloseIcon fontSize="small" /></IconButton>
        {/* time-left bar */}
        <motion.div initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: LIFETIME / 1000, ease: 'linear' }}
          style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 3, transformOrigin: 'left' }}>
          <Box sx={{ height: '100%', bgcolor: `${color}.main`, opacity: 0.6 }} />
        </motion.div>
      </Paper>
    </motion.div>
  );
}

/** Toast stack + listens to realtime events relevant to the logged-in role. */
export function NotificationProvider({ children }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setItems((list) => list.filter((i) => i.id !== id)), []);
  const notify = useCallback((n) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-3), { ...n, id }]); // max 4 on screen
    setTimeout(() => dismiss(id), LIFETIME);
  }, [dismiss]);

  const isPharmacy = user && ['pharmacist', 'admin'].includes(user.role);
  const isNurse = user?.role === 'nurse';

  // ---- Pharmacy events ----
  useSocketEvent('order:expiring', useCallback((o) => isPharmacy && notify({
    kind: 'warning',
    title: t('toast.expiring', { drug: o.drugSnapshot.name, min: o.minutesToExpiry }),
    body: `${shortId(o.orderNumber)} · ${o.departmentCode}`,
  }), [isPharmacy, notify, t]));

  useSocketEvent('order:expired', useCallback((o) => notify({
    kind: 'error',
    title: t('toast.expired', { drug: o.drugSnapshot.name }),
    body: `${shortId(o.orderNumber)} · ${o.departmentCode} · ${t('toast.discard')}`,
  }), [notify, t]));

  useSocketEvent('ai:stock-alert', useCallback((s) => isPharmacy && notify({
    kind: 'stock',
    title: t('toast.aiStock', { drug: s.name, status: t(`stock.${s.status}`) }),
    body: t('toast.aiStockBody', { days: s.daysOfCover, qty: s.recommendedOrder.toLocaleString('en-US'), unit: s.unit }),
  }), [isPharmacy, notify, t]));

  useSocketEvent('order:created', useCallback((o) => isPharmacy && o.priority === 'emergency' && notify({
    kind: 'error',
    title: t('toast.emergency', { drug: o.drugSnapshot.name }),
    body: `${o.dose.calculatedValue} ${o.dose.unit} · ${o.departmentCode}`,
  }), [isPharmacy, notify, t]));

  // ---- Nurse events: my ward's dose is ready ----
  useSocketEvent('order:updated', useCallback((o) => isNurse && o.status === 'ready' && notify({
    kind: 'success',
    title: t('toast.ready', { drug: o.drugSnapshot.name }),
    body: `${shortId(o.orderNumber)} · ${o.patient?.mrn ?? ''}`,
  }), [isNurse, notify, t]));

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Box sx={{ position: 'fixed', bottom: 20, insetInlineEnd: 20, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 1.25, alignItems: 'flex-end' }}>
        <AnimatePresence initial={false}>
          {items.map((i) => <Toast key={i.id} item={i} onClose={() => dismiss(i.id)} />)}
        </AnimatePresence>
      </Box>
    </NotifyContext.Provider>
  );
}