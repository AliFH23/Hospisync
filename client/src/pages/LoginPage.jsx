import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, useAnimationControls } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import Logo from '../components/Logo';
import PreferenceToggles from '../components/PreferenceToggles';
import { useAuth, HOME_BY_ROLE } from '../auth/AuthContext';

// Demo shortcuts are only shown in development builds
const DEMO = [
  { label: 'Pharmacist', email: 'pharmacist1@hospisync.dev' },
  { label: 'Nurse · ONC', email: 'nurse.onc@hospisync.dev' },
  { label: 'Admin', email: 'admin@hospisync.dev' },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };

function errorKey(err) {
  if (!err.response) return 'network';
  return { 400: 'required', 401: 'invalid', 403: 'deactivated', 429: 'tooMany' }[err.response.status] ?? 'invalid';
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shake = useAnimationControls();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (status === 'authed') return <Navigate to={HOME_BY_ROLE[user.role] ?? '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('required');
      shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const me = await login(email.trim(), password);
      navigate(location.state?.from || HOME_BY_ROLE[me.role] || '/', { replace: true });
    } catch (err) {
      setError(errorKey(err));
      shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, bgcolor: 'background.default' }}>
      {/* ---------- Hero (hidden on small screens) ---------- */}
      <Box sx={{
        display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between',
        p: 6, position: 'relative', overflow: 'hidden', color: '#fff',
        background: 'linear-gradient(160deg, #14324A 0%, #0F4A5C 60%, #0F8B8D 130%)',
      }}>
        {/* soft floating shapes */}
        {[{ s: 420, x: '-12%', y: '55%', d: 14 }, { s: 260, x: '70%', y: '-8%', d: 11 }, { s: 160, x: '62%', y: '68%', d: 9 }].map((b, i) => (
          <motion.div key={i} aria-hidden
            style={{ position: 'absolute', width: b.s, height: b.s, left: b.x, top: b.y, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,192,182,.35), rgba(59,192,182,0) 70%)' }}
            animate={{ y: [0, -18, 0], x: [0, 10, 0] }} transition={{ duration: b.d, repeat: Infinity, ease: 'easeInOut' }} />
        ))}

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ position: 'relative' }}>
          <Logo size={40} light />
        </motion.div>

        <motion.div variants={container} initial="hidden" animate="show" style={{ position: 'relative', maxWidth: 520 }}>
          <motion.div variants={item}>
            <Typography variant="h4" sx={{ fontSize: 36, lineHeight: 1.25 }}>{t('login.heroTitle')}</Typography>
          </motion.div>
          <Stack spacing={1.5} sx={{ mt: 4 }}>
            {t('login.heroPoints', { returnObjects: true }).map((p) => (
              <motion.div key={p} variants={item}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <CheckCircleRounded sx={{ color: '#3BC0B6' }} />
                  <Typography sx={{ color: 'rgba(255,255,255,.85)', fontSize: 16 }}>{p}</Typography>
                </Stack>
              </motion.div>
            ))}
          </Stack>
        </motion.div>

        <Typography sx={{ position: 'relative', color: 'rgba(255,255,255,.55)', fontSize: 13 }}>{t('app.tagline')}</Typography>
      </Box>

      {/* ---------- Form ---------- */}
      <Box sx={{ display: 'flex', flexDirection: 'column', p: { xs: 3, sm: 5 } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: { md: 'none' } }}><Logo size={30} /></Box>
          <Box sx={{ ml: 'auto' }}><PreferenceToggles /></Box>
        </Stack>

        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <motion.div variants={container} initial="hidden" animate="show" style={{ width: '100%', maxWidth: 400 }}>
            <motion.div variants={item}>
              <Typography variant="h4">{t('login.title')}</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>{t('login.subtitle')}</Typography>
            </motion.div>

            <motion.div animate={shake}>
              <Box component="form" onSubmit={submit} noValidate>
                <Stack spacing={2.25}>
                  <motion.div variants={item}>
                    <TextField label={t('login.email')} type="email" autoComplete="username" autoFocus
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      slotProps={{ htmlInput: { dir: 'ltr' } }} />
                  </motion.div>
                  <motion.div variants={item}>
                    <TextField label={t('login.password')} type={show ? 'text' : 'password'} autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      slotProps={{
                        htmlInput: { dir: 'ltr' },
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton onClick={() => setShow((s) => !s)} edge="end" aria-label={show ? t('login.hidePassword') : t('login.showPassword')}>
                                {show ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        },
                      }} />
                  </motion.div>

                  {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }}>{t(`login.errors.${error}`)}</Alert>
                    </motion.div>
                  )}

                  <motion.div variants={item} whileTap={{ scale: 0.98 }}>
                    <Button type="submit" variant="contained" size="large" fullWidth disabled={busy} sx={{ py: 1.4 }}>
                      {busy ? <CircularProgress size={22} color="inherit" /> : t('login.submit')}
                    </Button>
                  </motion.div>
                </Stack>
              </Box>
            </motion.div>

            {import.meta.env.DEV && (
              <motion.div variants={item}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4, mb: 1 }}>{t('login.demo')}</Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {DEMO.map((d) => (
                    <Chip key={d.email} label={d.label} variant="outlined" clickable
                      onClick={() => { setEmail(d.email); setPassword('Hospisync@2026'); setError(''); }} />
                  ))}
                </Stack>
              </motion.div>
            )}
          </motion.div>
        </Box>
      </Box>
    </Box>
  );
}