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
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
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
import { alpha } from '@mui/material/styles';
import SearchRounded from '@mui/icons-material/SearchRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import MoveToInboxOutlined from '@mui/icons-material/MoveToInboxOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import api, { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useNotify } from '../components/NotificationCenter';
import { useSocketEvent } from '../socket/SocketProvider';
import Ltr from '../components/Ltr';
import { basisLabel, routeLabel } from '../utils/dose';

const CATEGORIES = ['chemotherapy', 'tpn', 'narcotic', 'other_high_alert'];
const BASES = ['fixed', 'weight', 'bsa'];
const UNITS = ['mg', 'mcg', 'g', 'units', 'mL', 'mmol', 'mEq'];
const ROUTES = ['IV_INFUSION', 'IV_PUSH', 'IV_PIGGYBACK', 'CENTRAL_LINE', 'INTRATHECAL', 'SUBCUT'];
const STORAGE = ['room_temp', 'refrigerated', 'frozen', 'protect_from_light'];
const SCHEDULES = ['I', 'II', 'III', 'IV', 'V'];
const fmt = (n) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const EMPTY_DRUG = {
  code: '', name: '', genericName: '', category: 'chemotherapy', controlledSchedule: '',
  basis: 'bsa', unit: 'mg', maxSingleDose: '', allowedRoutes: ['IV_INFUSION'],
  beyondUseHours: '24', storage: 'room_temp', unitCost: '', reorderLevel: '', onHand: '',
};

/** Admin: create or edit a formulary entry */
function DrugDialog({ drug, onClose, onSaved }) {
  const { t } = useTranslation();
  const isNew = !drug._id;
  const [f, setF] = useState(() => (isNew ? EMPTY_DRUG : {
    code: drug.code, name: drug.name, genericName: drug.genericName ?? '', category: drug.category,
    controlledSchedule: drug.controlledSchedule ?? '', basis: drug.dosing.basis, unit: drug.dosing.unit,
    maxSingleDose: drug.dosing.maxSingleDose ?? '', allowedRoutes: drug.allowedRoutes,
    beyondUseHours: String(drug.stability.beyondUseHours), storage: drug.stability.storage ?? 'room_temp',
    unitCost: String(drug.unitCost?.amount ?? ''), reorderLevel: String(drug.stock?.reorderLevel ?? ''), onHand: '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v) => (v === '' ? undefined : Number(v));

  const valid = f.code.trim() && f.name.trim() && f.allowedRoutes.length && Number(f.beyondUseHours) > 0
    && (f.category !== 'narcotic' || f.controlledSchedule);

  const save = async () => {
    setSaving(true);
    setError('');
    const body = {
      code: f.code.trim(), name: f.name.trim(), genericName: f.genericName.trim() || undefined,
      category: f.category, controlledSchedule: f.category === 'narcotic' ? f.controlledSchedule : (isNew ? undefined : null),
      allowedRoutes: f.allowedRoutes,
      dosing: { basis: f.basis, unit: f.unit, maxSingleDose: num(f.maxSingleDose) },
      stability: { beyondUseHours: Number(f.beyondUseHours), storage: f.storage },
      unitCost: { amount: num(f.unitCost) ?? 0 },
      stock: { reorderLevel: num(f.reorderLevel) ?? 0, ...(isNew && { onHand: num(f.onHand) ?? 0 }) },
    };
    try {
      const { data } = isNew ? await api.post('/drugs', body) : await api.patch(`/drugs/${drug._id}`, body);
      onSaved(data.drug, isNew);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const ltr = { htmlInput: { dir: 'ltr' } };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isNew ? t('formulary.add') : t('formulary.edit')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
          <TextField label={t('formulary.f.name')} value={f.name} onChange={set('name')} slotProps={ltr} />
          <TextField label={t('formulary.f.code')} value={f.code} onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase() }))} slotProps={ltr} />
          <TextField label={t('formulary.f.generic')} value={f.genericName} onChange={set('genericName')} slotProps={ltr} />
          <TextField select label={t('formulary.f.category')} value={f.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{t(`category.${c}`)}</MenuItem>)}
          </TextField>
          {f.category === 'narcotic' && (
            <TextField select label={t('formulary.f.schedule')} value={f.controlledSchedule} onChange={set('controlledSchedule')} error={!f.controlledSchedule}>
              {SCHEDULES.map((s) => <MenuItem key={s} value={s}><Ltr>{s}</Ltr></MenuItem>)}
            </TextField>
          )}
          <TextField select label={t('formulary.f.basis')} value={f.basis} onChange={set('basis')}>
            {BASES.map((b) => <MenuItem key={b} value={b}>{t(`orderForm.basis.${b}`)}</MenuItem>)}
          </TextField>
          <TextField select label={t('formulary.f.unit')} value={f.unit} onChange={set('unit')}>
            {UNITS.map((u) => <MenuItem key={u} value={u}><Ltr>{u}</Ltr></MenuItem>)}
          </TextField>
          <TextField type="number" label={t('formulary.f.max')} value={f.maxSingleDose} onChange={set('maxSingleDose')} slotProps={{ ...ltr, input: { endAdornment: <InputAdornment position="end"><Ltr>{f.unit}</Ltr></InputAdornment> } }} />
          <TextField type="number" label={t('formulary.f.stability')} value={f.beyondUseHours} onChange={set('beyondUseHours')} slotProps={{ ...ltr, input: { endAdornment: <InputAdornment position="end"><Ltr>h</Ltr></InputAdornment> } }} />
          <TextField select label={t('formulary.f.storage')} value={f.storage} onChange={set('storage')}>
            {STORAGE.map((s) => <MenuItem key={s} value={s}>{t(`formulary.storage.${s}`)}</MenuItem>)}
          </TextField>
          <TextField type="number" label={t('formulary.f.cost', { unit: f.unit })} value={f.unitCost} onChange={set('unitCost')} slotProps={{ ...ltr, input: { endAdornment: <InputAdornment position="end"><Ltr>JOD</Ltr></InputAdornment> } }} />
          <TextField type="number" label={t('formulary.f.reorder')} value={f.reorderLevel} onChange={set('reorderLevel')} slotProps={{ ...ltr, input: { endAdornment: <InputAdornment position="end"><Ltr>{f.unit}</Ltr></InputAdornment> } }} />
          {isNew && <TextField type="number" label={t('formulary.f.opening')} value={f.onHand} onChange={set('onHand')} slotProps={{ ...ltr, input: { endAdornment: <InputAdornment position="end"><Ltr>{f.unit}</Ltr></InputAdornment> } }} />}
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Typography variant="body2" color={f.allowedRoutes.length ? 'text.secondary' : 'error'} sx={{ mb: 1 }}>{t('formulary.f.routes')}</Typography>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              {ROUTES.map((r) => {
                const on = f.allowedRoutes.includes(r);
                return (
                  <Chip key={r} clickable color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} label={<Ltr>{routeLabel(r)}</Ltr>}
                    onClick={() => setF((s) => ({ ...s, allowedRoutes: on ? s.allowedRoutes.filter((x) => x !== r) : [...s.allowedRoutes, r] }))} />
                );
              })}
            </Stack>
          </Box>
        </Box>
        {!isNew && <Alert severity="info" sx={{ mt: 2, borderRadius: 3 }}>{t('formulary.stockNote')}</Alert>}
        {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 3 }}><span dir="auto">{error}</span></Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onClose}>{t('common.back')}</Button>
        <Button variant="contained" disabled={!valid || saving} onClick={save}>{saving ? <CircularProgress size={20} color="inherit" /> : t('formulary.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Pharmacist/admin: a delivery arrived, or a physical count corrects the number */
function StockDialog({ drug, onClose, onSaved }) {
  const { t } = useTranslation();
  const [type, setType] = useState('receive');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const q = Number(qty);
  const after = type === 'receive' ? drug.stock.onHand + (q || 0) : q || 0;
  const valid = qty !== '' && q >= 0 && (type === 'count' ? note.trim() : q > 0);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/drugs/${drug._id}/stock`, { type, quantity: q, note: note.trim() || undefined });
      onSaved(data.drug);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t('formulary.stockTitle')}
        <Typography dir="ltr" color="text.secondary" sx={{ fontWeight: 600, textAlign: 'left' }}>{drug.name}</Typography>
      </DialogTitle>
      <DialogContent>
        <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={type} onChange={(_, v) => v && setType(v)} sx={{ mb: 2, mt: 0.5 }}>
          <ToggleButton value="receive">{t('formulary.receive')}</ToggleButton>
          <ToggleButton value="count">{t('formulary.count')}</ToggleButton>
        </ToggleButtonGroup>
        <TextField autoFocus type="number" label={t(type === 'receive' ? 'formulary.qtyReceived' : 'formulary.qtyCounted')} value={qty} onChange={(e) => setQty(e.target.value)}
          slotProps={{ htmlInput: { dir: 'ltr', min: 0 }, input: { endAdornment: <InputAdornment position="end"><Ltr>{drug.dosing.unit}</Ltr></InputAdornment> } }} />
        <TextField label={t(type === 'count' ? 'formulary.reasonRequired' : 'formulary.noteOptional')} value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 2 }}
          placeholder={type === 'receive' ? 'PO-2026-118 · Lot A2291' : ''} slotProps={{ htmlInput: { maxLength: 300, dir: 'auto' } }} />
        <Box sx={(th) => ({ mt: 2, p: 1.5, borderRadius: 3, bgcolor: alpha(th.palette.primary.main, th.palette.mode === 'dark' ? 0.12 : 0.06) })}>
          <Typography variant="body2" color="text.secondary">{t('formulary.after')}</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
            <Ltr>{fmt(drug.stock.onHand)} → {fmt(after)} {drug.dosing.unit}</Ltr>
          </Typography>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2, borderRadius: 3 }}><span dir="auto">{error}</span></Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onClose}>{t('common.back')}</Button>
        <Button variant="contained" disabled={!valid || saving} onClick={save}>{saving ? <CircularProgress size={20} color="inherit" /> : t('formulary.confirm')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function FormularyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotify();
  const isAdmin = user.role === 'admin';
  const isStaff = user.role !== 'nurse'; // nurses don't see stock or cost

  const [drugs, setDrugs] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // drug object, or {} for new
  const [stocking, setStocking] = useState(null);
  const debounce = useRef();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/drugs', { params: isAdmin && showInactive ? { active: 'false' } : {} });
      setDrugs(data.drugs);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [isAdmin, showInactive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(debounce.current), []);

  // Stock numbers move when pharmacists start preparing
  const soon = useCallback(() => { clearTimeout(debounce.current); debounce.current = setTimeout(load, 1200); }, [load]);
  useSocketEvent('order:updated', useCallback((o) => isStaff && o.status === 'preparing' && soon(), [isStaff, soon]));

  const replace = (d) => setDrugs((list) => {
    const rest = list.filter((x) => x._id !== d._id);
    return [...rest, { ...d, isLowStock: d.stock ? d.stock.onHand <= d.stock.reorderLevel : undefined }];
  });

  const toggleActive = async (d) => {
    try {
      const { data } = await api.patch(`/drugs/${d._id}`, { isActive: !d.isActive });
      replace(data.drug);
    } catch (err) {
      notify({ kind: 'error', title: t('queue.actionFailed'), body: errorMessage(err) });
    }
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (drugs ?? [])
      .filter((d) => !category || d.category === category)
      .filter((d) => !term || [d.name, d.genericName, d.code].some((s) => s?.toLowerCase().includes(term)))
      .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
  }, [drugs, q, category]);

  const lowCount = (drugs ?? []).filter((d) => d.isLowStock && d.isActive !== false).length;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" fullWidth={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('formulary.search')} sx={{ minWidth: 240 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Chip clickable label={t('ordersPage.all')} color={!category ? 'primary' : 'default'} variant={!category ? 'filled' : 'outlined'} onClick={() => setCategory('')} />
          {CATEGORIES.map((c) => (
            <Chip key={c} clickable label={t(`category.${c}`)} color={category === c ? 'primary' : 'default'} variant={category === c ? 'filled' : 'outlined'} onClick={() => setCategory(c)} />
          ))}
        </Stack>
        <Box sx={{ flex: 1 }} />
        {isAdmin && <FormControlLabel control={<Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />} label={t('formulary.showInactive')} />}
        {isAdmin && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({})}>{t('formulary.add')}</Button>}
      </Stack>

      {isStaff && lowCount > 0 && (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>{t('formulary.lowAlert', { count: lowCount })}</Alert>
      )}
      {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card sx={{ p: { xs: 1, md: 1.5 } }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: isStaff ? 1000 : 760, '& td, & th': { borderColor: 'divider', py: 1.25 }, '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('stockPage.col.drug')}</TableCell>
                  <TableCell>{t('formulary.f.category')}</TableCell>
                  <TableCell>{t('formulary.col.dosing')}</TableCell>
                  <TableCell>{t('formulary.f.routes')}</TableCell>
                  <TableCell>{t('formulary.col.stability')}</TableCell>
                  {isStaff && <TableCell align="right">{t('stockPage.col.onHand')}</TableCell>}
                  {isStaff && <TableCell align="right">{t('formulary.col.cost')}</TableCell>}
                  {isStaff && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {!drugs && [0, 1, 2, 3, 4].map((i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton height={34} /></TableCell></TableRow>)}
                <AnimatePresence initial={false}>
                  {shown.map((d) => (
                    <TableRow key={d._id} component={motion.tr} layout initial={{ opacity: 0 }} animate={{ opacity: d.isActive === false ? 0.5 : 1 }} exit={{ opacity: 0 }}>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography dir="ltr" sx={{ fontWeight: 600, fontSize: 14, textAlign: 'left' }}>{d.name}</Typography>
                          {d.controlledSchedule && <Chip size="small" color="warning" variant="outlined" label={<Ltr>C{d.controlledSchedule}</Ltr>} />}
                          {d.isActive === false && <Chip size="small" label={t('formulary.inactive')} />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary"><Ltr>{d.code}{d.genericName ? ` · ${d.genericName}` : ''}</Ltr></Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(`category.${d.category}`)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Ltr>{basisLabel(d)}</Ltr>
                        {d.dosing.maxSingleDose != null && <Typography variant="caption" color="text.secondary" component="div">{t('formulary.maxShort')} <Ltr>{fmt(d.dosing.maxSingleDose)} {d.dosing.unit}</Ltr></Typography>}
                      </TableCell>
                      <TableCell><Ltr>{d.allowedRoutes.map(routeLabel).join(', ')}</Ltr></TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Ltr>{d.stability.beyondUseHours} h</Ltr>
                        <Typography variant="caption" color="text.secondary" component="div">{t(`formulary.storage.${d.stability.storage ?? 'room_temp'}`)}</Typography>
                      </TableCell>
                      {isStaff && (
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: d.isLowStock ? 'warning.main' : 'text.primary', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            {d.isLowStock && <WarningAmberRounded sx={{ fontSize: 16 }} />}
                            <Ltr>{fmt(d.stock.onHand)} {d.dosing.unit}</Ltr>
                          </Typography>
                          <Typography variant="caption" color="text.secondary" component="div">{t('formulary.reorderAt')} <Ltr>{fmt(d.stock.reorderLevel)}</Ltr></Typography>
                        </TableCell>
                      )}
                      {isStaff && <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}><Ltr>{d.unitCost?.amount ?? 0} JOD/{d.dosing.unit}</Ltr></TableCell>}
                      {isStaff && (
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <Tooltip title={t('formulary.stockTitle')}><IconButton size="small" onClick={() => setStocking(d)}><MoveToInboxOutlined fontSize="small" /></IconButton></Tooltip>
                          {isAdmin && <Tooltip title={t('formulary.edit')}><IconButton size="small" onClick={() => setEditing(d)}><EditOutlined fontSize="small" /></IconButton></Tooltip>}
                          {isAdmin && (
                            <Tooltip title={d.isActive === false ? t('formulary.activate') : t('formulary.deactivate')}>
                              <Switch size="small" checked={d.isActive !== false} onChange={() => toggleActive(d)} />
                            </Tooltip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </AnimatePresence>
                {drugs && shown.length === 0 && (
                  <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>{t('formulary.empty')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Card>
      </motion.div>

      {editing && (
        <DrugDialog drug={editing} onClose={() => setEditing(null)} onSaved={(d, isNew) => {
          setEditing(null);
          replace(d);
          notify({ kind: 'success', title: t(isNew ? 'formulary.created' : 'formulary.saved', { drug: d.name }) });
        }} />
      )}
      {stocking && (
        <StockDialog drug={stocking} onClose={() => setStocking(null)} onSaved={(d) => {
          setStocking(null);
          replace(d);
          notify({ kind: 'success', title: t('formulary.stockSaved', { drug: d.name }), body: `${fmt(d.stock.onHand)} ${d.dosing.unit}` });
        }} />
      )}
    </Stack>
  );
}