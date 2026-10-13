import { useState } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MedicationIcon from '@mui/icons-material/Medication';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import GroupIcon from '@mui/icons-material/Group';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PhoneInTalkIcon from '@mui/icons-material/PhoneInTalk';
import Logo from '../components/Logo';
import PreferenceToggles from '../components/PreferenceToggles';
import { useAuth } from '../auth/AuthContext';
import { useSocket } from '../socket/SocketProvider';
import { nameParts } from '../utils/orders';

const DRAWER = 256;

// Navigation per role: each section is shown only if the user has at least one item in it
const NAV = [
  { section: 'clinical', items: [
    { to: '/prescriptions', key: 'myPrescriptions', icon: AssignmentIndIcon, roles: ['doctor'] },
    { to: '/prescribe', key: 'prescribe', icon: EditNoteIcon, roles: ['doctor'] },
  ] },
  { section: 'ward', items: [
    { to: '/ward', key: 'wardOrders', icon: SpaceDashboardIcon, roles: ['nurse'] },
    { to: '/ward/new', key: 'verbalOrder', icon: PhoneInTalkIcon, roles: ['nurse'] },
  ] },
  { section: 'pharmacy', items: [
    { to: '/queue', key: 'queue', icon: SpaceDashboardIcon, roles: ['pharmacist', 'admin'] },
    { to: '/orders', key: 'orders', icon: ListAltIcon, roles: ['pharmacist', 'admin'] },
    { to: '/formulary', key: 'formulary', icon: MedicationIcon, roles: ['pharmacist', 'admin', 'doctor', 'nurse'] },
  ] },
  { section: 'insights', items: [
    { to: '/stock', key: 'stock', icon: Inventory2Icon, roles: ['pharmacist', 'admin'] },
    { to: '/forecast', key: 'forecast', icon: AutoGraphIcon, roles: ['pharmacist', 'admin'] },
    { to: '/waste', key: 'waste', icon: DeleteSweepIcon, roles: ['pharmacist', 'admin'] },
  ] },
  { section: 'administration', items: [
    { to: '/users', key: 'users', icon: GroupIcon, roles: ['admin'] },
  ] },
];

/** Green pulsing "Live" when realtime is connected, amber "Reconnecting…" otherwise */
function LiveBadge() {
  const { t } = useTranslation();
  const { connected } = useSocket();
  const color = connected ? 'success' : 'warning';
  return (
    <Box sx={(th) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.4, borderRadius: 5, fontSize: 12, fontWeight: 600,
      color: th.palette[color].main, bgcolor: th.palette.mode === 'dark' ? 'rgba(255,255,255,.05)' : th.palette[color].light, verticalAlign: 'middle' })}>
      <Box sx={{ position: 'relative', width: 8, height: 8 }}>
        <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: 'currentColor' }} />
        {connected && (
          <motion.span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'currentColor' }}
            animate={{ scale: [1, 2.4], opacity: [0.5, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
        )}
      </Box>
      {connected ? t('common.live') : t('common.offline')}
    </Box>
  );
}

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

function Sidebar({ onNavigate }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { initials } = nameParts(user.fullName);

  return (
    <Box sx={{ height: '100%', bgcolor: 'sidebar.bg', color: 'sidebar.text', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ px: 1, pt: 1, pb: 3 }}><Logo size={32} light /></Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {NAV.map(({ section, items }) => {
          const visible = items.filter((i) => i.roles.includes(user.role));
          if (!visible.length) return null;
          return (
            <Box key={section} sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.2, color: '#6D8899', px: 1.5, mb: 1, textTransform: 'uppercase' }}>
                {t(`nav.${section}`)}
              </Typography>
              {visible.map(({ to, key, icon: Icon }) => (
                <Box key={to} component={NavLink} to={to} end onClick={onNavigate}
                  sx={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1.2, mb: 0.5,
                    borderRadius: 3, color: 'sidebar.text', textDecoration: 'none', fontSize: 14, fontWeight: 500,
                    transition: 'background-color .2s, color .2s',
                    '&:hover': { bgcolor: 'rgba(255,255,255,.05)', color: '#fff' },
                    '&.active': { color: 'sidebar.active' },
                    '&.active .nav-ic': { color: 'sidebar.accent' },
                  }}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="nav-active"
                          style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(59,192,182,.14)' }}
                          transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
                      )}
                      <Icon className="nav-ic" fontSize="small" sx={{ position: 'relative' }} />
                      <Box component="span" sx={{ position: 'relative' }}>{t(`nav.${key}`)}</Box>
                    </>
                  )}
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.5, borderRadius: 3.5, bgcolor: 'rgba(255,255,255,.05)' }}>
        <Avatar sx={{ width: 36, height: 36, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg,#3BC0B6,#2A7FA8)' }}>{initials}</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user.fullName}</Typography>
          <Typography noWrap sx={{ fontSize: 11, color: '#8FA7B6' }}>
            {t(`roles.${user.role}`)}{user.department ? ` · ${user.department.code}` : ''}
          </Typography>
        </Box>
        <Tooltip title={t('common.logout')}>
          <IconButton size="small" onClick={logout} sx={{ color: '#8FA7B6', '&:hover': { color: '#fff' } }}>
            <LogoutIcon fontSize="small" sx={(th) => ({ transform: th.direction === 'rtl' ? 'scaleX(-1)' : 'none' })} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Freeze the page element per route: the exiting page keeps rendering itself during the
  // exit animation instead of mounting the next page twice (which also lost router state).
  const outlet = useOutlet();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Drawer
        variant={desktop ? 'permanent' : 'temporary'}
        open={desktop || open}
        onClose={() => setOpen(false)}
        sx={{ width: { md: DRAWER }, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER, border: 0 } }}
      >
        <Sidebar onNavigate={() => setOpen(false)} />
      </Drawer>

      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 3.5 }, pt: { xs: 2, md: 3 } }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
          {!desktop && <IconButton onClick={() => setOpen(true)}><MenuIcon /></IconButton>}
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="h5" noWrap>{t(`greeting.${greetingKey()}`, { name: nameParts(user.fullName).short })}</Typography>
              <LiveBadge />
            </Stack>
            <Typography variant="body2" color="text.secondary" noWrap>
              {user.hospital?.name}{user.department ? ` · ${user.department.name}` : ''}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <PreferenceToggles />
        </Stack>

        {/* Page transition: soft fade + rise on every route change */}
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}>
            {outlet}
          </motion.div>
        </AnimatePresence>
      </Box>
    </Box>
  );
}