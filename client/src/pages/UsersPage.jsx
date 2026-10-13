import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import SearchRounded from '@mui/icons-material/SearchRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import AutorenewRounded from '@mui/icons-material/AutorenewRounded';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useNotify } from '../components/NotificationCenter';
import Ltr from '../components/Ltr';

const ROLES = ['nurse', 'pharmacist', 'admin'];
const ROLE_COLOR = { nurse: 'info', pharmacist: 'primary', admin: 'secondary' };

/** 14-character temporary password from the browser's secure random generator */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function UserDialog({ target, departments, isSelf, onClose, onSaved }) {
  const { t } = useTranslation();
  const isNew = !target._id;
  const [f, setF] = useState({
    fullName: target.fullName ?? '', email: target.email ?? '', employeeId: target.employeeId ?? '',
    role: target.role ?? 'nurse', department: target.department ?? '', password: isNew ? generatePassword() : '',
  });
  const [show, setShow] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const pwOk = isNew ? f.password.length >= 10 : !f.password || f.password.length >= 10;
  const valid = f.fullName.trim() && (!isNew || (/^\S+@\S+\.\S+$/.test(f.email) && f.employeeId.trim())) && pwOk && (f.role !== 'nurse' || f.department);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const body = isNew
        ? { fullName: f.fullName.trim(), email: f.email.trim(), employeeId: f.employeeId.trim(), role: f.role, password: f.password, ...(f.role === 'nurse' && { department: f.department }) }
        : {
          fullName: f.fullName.trim(),
          ...(!isSelf && { role: f.role }),
          ...(f.role === 'nurse' && { department: f.department }),
          ...(f.password && { password: f.password }),
        };
      const { data } = isNew ? await api.post('/users', body) : await api.patch(`/users/${target._id}`, body);
      onSaved(data.user, isNew, isNew || f.password ? f.password : '');
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isNew ? t('users.add') : t('users.edit')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('users.f.name')} value={f.fullName} onChange={set('fullName')} slotProps={{ htmlInput: { dir: 'auto' } }} />
          <TextField label={t('users.f.email')} type="email" value={f.email} onChange={set('email')} disabled={!isNew} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <TextField label={t('users.f.employeeId')} value={f.employeeId} onChange={(e) => setF((s) => ({ ...s, employeeId: e.target.value.toUpperCase() }))} disabled={!isNew} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>{t('users.f.role')}</Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={f.role} disabled={isSelf} onChange={(_, v) => v && setF((s) => ({ ...s, role: v }))}>
              {ROLES.map((r) => <ToggleButton key={r} value={r}>{t(`roles.${r}`)}</ToggleButton>)}
            </ToggleButtonGroup>
            {isSelf && <Typography variant="caption" color="text.secondary">{t('users.selfRole')}</Typography>}
          </Box>
          <AnimatePresence initial={false}>
            {f.role === 'nurse' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <TextField select label={t('users.f.ward')} value={f.department} onChange={set('department')} error={!f.department} sx={{ mt: 0.5 }}>
                  {departments.map((d) => <MenuItem key={d._id} value={d._id}><Ltr>{d.code}</Ltr>&nbsp;· {d.name}</MenuItem>)}
                </TextField>
              </motion.div>
            )}
          </AnimatePresence>
          <TextField label={isNew ? t('users.f.password') : t('users.f.newPassword')} type={show ? 'text' : 'password'} value={f.password} onChange={set('password')}
            error={!pwOk} helperText={isNew ? t('users.pwHint') : t('users.resetHint')}
            slotProps={{
              htmlInput: { dir: 'ltr', autoComplete: 'new-password' },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={t('users.generate')}><IconButton size="small" onClick={() => { setF((s) => ({ ...s, password: generatePassword() })); setShow(true); }}><AutorenewRounded fontSize="small" /></IconButton></Tooltip>
                    <IconButton size="small" onClick={() => setShow((v) => !v)}>{show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</IconButton>
                  </InputAdornment>
                ),
              },
            }} />
          {error && <Alert severity="error" sx={{ borderRadius: 3 }}><span dir="auto">{error}</span></Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onClose}>{t('common.back')}</Button>
        <Button variant="contained" disabled={!valid || saving} onClick={save}>{saving ? <CircularProgress size={20} color="inherit" /> : t('formulary.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const { user: me } = useAuth();
  const notify = useNotify();
  const departments = me.hospital?.departments ?? [];
  const deptCode = useMemo(() => Object.fromEntries(departments.map((d) => [d._id, d.code])), [departments]);

  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [created, setCreated] = useState(null); // { user, password } shown once after saving
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [i18n.language]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const replace = (u) => setUsers((list) => [...list.filter((x) => x._id !== u._id), u]);

  const toggleActive = async (u) => {
    try {
      const { data } = await api.patch(`/users/${u._id}`, { isActive: !u.isActive });
      replace(data.user);
      notify({ kind: data.user.isActive ? 'success' : 'warning', title: t(data.user.isActive ? 'users.activated' : 'users.deactivated', { name: u.fullName }) });
    } catch (err) {
      notify({ kind: 'error', title: t('queue.actionFailed'), body: errorMessage(err) });
    }
  };

  const counts = Object.fromEntries(ROLES.map((r) => [r, (users ?? []).filter((u) => u.role === r).length]));
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => role === 'all' || u.role === role)
      .filter((u) => !term || [u.fullName, u.email, u.employeeId].some((s) => s?.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.fullName.localeCompare(b.fullName));
  }, [users, role, q]);

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" fullWidth={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('users.search')} sx={{ minWidth: 260 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<PersonAddAlt1Rounded />} onClick={() => setEditing({})}>{t('users.add')}</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card sx={{ p: { xs: 1, md: 1.5 } }}>
          <Tabs value={role} onChange={(_, v) => setRole(v)} sx={{ px: 1, mb: 1, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}>
            <Tab value="all" label={`${t('ordersPage.all')} · ${users?.length ?? 0}`} />
            {ROLES.map((r) => <Tab key={r} value={r} label={`${t(`roles.${r}`)} · ${counts[r]}`} />)}
          </Tabs>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 860, '& td, & th': { borderColor: 'divider', py: 1.25 }, '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('users.col.user')}</TableCell>
                  <TableCell>{t('users.f.role')}</TableCell>
                  <TableCell>{t('users.f.employeeId')}</TableCell>
                  <TableCell>{t('users.f.ward')}</TableCell>
                  <TableCell>{t('users.col.lastLogin')}</TableCell>
                  <TableCell>{t('users.col.active')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {!users && [0, 1, 2, 3].map((i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton height={40} /></TableCell></TableRow>)}
                <AnimatePresence initial={false}>
                  {shown.map((u) => {
                    const self = u._id === me._id;
                    return (
                      <TableRow key={u._id} component={motion.tr} layout initial={{ opacity: 0 }} animate={{ opacity: u.isActive ? 1 : 0.5 }} exit={{ opacity: 0 }}>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                            <Avatar sx={{ width: 34, height: 34, fontSize: 13, fontWeight: 700, bgcolor: `${ROLE_COLOR[u.role]}.main` }}>
                              {u.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                                <span dir="auto">{u.fullName}</span>{self && <Typography component="span" variant="caption" color="primary.main" sx={{ fontWeight: 700 }}> · {t('users.you')}</Typography>}
                              </Typography>
                              <Typography variant="caption" color="text.secondary"><Ltr>{u.email}</Ltr></Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell><Chip size="small" variant="outlined" color={ROLE_COLOR[u.role]} label={t(`roles.${u.role}`)} /></TableCell>
                        <TableCell><Ltr>{u.employeeId}</Ltr></TableCell>
                        <TableCell>{u.department ? <Ltr>{deptCode[u.department] ?? '—'}</Ltr> : '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{u.lastLoginAt ? <Ltr>{dateFmt.format(new Date(u.lastLoginAt))}</Ltr> : t('users.never')}</TableCell>
                        <TableCell>
                          <Tooltip title={self ? t('users.selfDeactivate') : ''}>
                            <span><Switch size="small" checked={u.isActive} disabled={self} onChange={() => toggleActive(u)} /></span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right"><IconButton size="small" onClick={() => setEditing(u)}><EditOutlined fontSize="small" /></IconButton></TableCell>
                      </TableRow>
                    );
                  })}
                </AnimatePresence>
                {users && shown.length === 0 && <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>{t('users.empty')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        </Card>
      </motion.div>

      {editing && (
        <UserDialog target={editing} departments={departments} isSelf={editing._id === me._id} onClose={() => setEditing(null)}
          onSaved={(u, isNew, password) => {
            setEditing(null);
            replace(u);
            if (password) setCreated({ user: u, password, isNew });
            else notify({ kind: 'success', title: t('users.saved', { name: u.fullName }) });
          }} />
      )}

      {/* The temporary password is shown once, so the admin can hand it over */}
      <Dialog open={!!created} onClose={() => setCreated(null)} fullWidth maxWidth="xs">
        <DialogTitle>{created?.isNew ? t('users.createdTitle') : t('users.resetTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ borderRadius: 3, mb: 2 }}>{t('users.shareOnce')}</Alert>
          {created && (
            <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'subtle', fontFamily: 'monospace' }} dir="ltr">
              <div>{created.user.email}</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{created.password}</div>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => navigator.clipboard?.writeText(`${created.user.email}\n${created.password}`)}>{t('users.copy')}</Button>
          <Button variant="contained" onClick={() => setCreated(null)}>{t('users.done')}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}