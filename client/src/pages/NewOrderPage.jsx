import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { alpha, useTheme } from '@mui/material/styles';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import PhoneInTalkRounded from '@mui/icons-material/PhoneInTalkRounded';
import api, { errorMessage } from '../api/client';
import { useAuth, HOME_BY_ROLE } from '../auth/AuthContext';
import { useNotify } from '../components/NotificationCenter';
import Ltr from '../components/Ltr';
import { PRIORITY_COLOR } from '../theme/tokens';
import { basisLabel, calculateDose, findAllergy, routeLabel, toLocalInput } from '../utils/dose';
import { shortId } from '../utils/orders';

// Default "needed by" for each priority (minutes from now)
const DEFAULT_LEAD = { emergency: 30, urgent: 60, routine: 240 };
const QUICK = [30, 60, 120, 240];
const INFUSION_ROUTES = ['IV_INFUSION', 'IV_PIGGYBACK', 'CENTRAL_LINE'];
// Same rules as the server (VERBAL_ORDER_RULES): nurses may only relay urgent/emergency, non-chemo orders
const VERBAL_PRIORITIES = ['emergency', 'urgent'];
const VERBAL_BLOCKED = ['chemotherapy'];

const EMPTY = {
  mrn: '', name: '', weightKg: '', heightCm: '', allergies: [],
  drug: null, route: '', prescribed: '', diluentName: '', diluentMl: '', durationMin: '',
  priority: 'routine', requiredBy: '', notes: '',
};

/** Numbered section card */
function Section({ n, title, children, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}>
      <Card sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2 }}>
          <Box sx={(t) => ({ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
            color: 'primary.main', bgcolor: alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.18 : 0.1) })}>
            <span className="num">{n}</span>
          </Box>
          <Typography variant="subtitle1">{title}</Typography>
        </Stack>
        {children}
      </Card>
    </motion.div>
  );
}

/** One line of the safety checklist: ok / failed / not yet known */
function Check({ state, label }) {
  const Icon = state === true ? CheckCircleRounded : state === false ? CancelRounded : RadioButtonUncheckedRounded;
  const color = state === true ? 'success.main' : state === false ? 'error.main' : 'text.disabled';
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.4 }}>
      <motion.span key={String(state)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ display: 'flex' }}>
        <Icon sx={{ fontSize: 18, color }} />
      </motion.span>
      <Typography variant="body2" sx={{ color: state === false ? 'error.main' : 'text.primary' }}>{label}</Typography>
    </Stack>
  );
}

export default function NewOrderPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();

  const [drugs, setDrugs] = useState(null);
  const [loadError, setLoadError] = useState('');
  // Doctors prescribe (CPOE). Nurses can only enter a verbal / telephone order on a doctor's behalf.
  const isVerbal = user.role === 'nurse';
  const startPriority = isVerbal ? 'urgent' : 'routine';
  const [f, setF] = useState(() => ({ ...EMPTY, priority: startPriority, requiredBy: toLocalInput(Date.now() + DEFAULT_LEAD[startPriority] * 60000) }));
  const [prescribers, setPrescribers] = useState([]);
  const [prescriberId, setPrescriberId] = useState('');
  const [readBack, setReadBack] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState('');
  const [duplicate, setDuplicate] = useState(''); // server's duplicate message → confirm dialog

  useEffect(() => {
    api.get('/drugs').then(({ data }) => setDrugs(data.drugs)).catch((err) => setLoadError(errorMessage(err)));
    if (isVerbal) {
      // Doctors of my ward first, then the rest of the hospital
      api.get('/users/prescribers').then(({ data }) => {
        const mine = user.department?.code;
        setPrescribers([...data.doctors].sort((a, b) => Number(b.departmentCode === mine) - Number(a.departmentCode === mine)));
      }).catch((err) => setLoadError(errorMessage(err)));
    }
  }, [isVerbal, user.department?.code]);

  const set = (key) => (value) => { setF((s) => ({ ...s, [key]: value })); setServerError(''); };
  const onInput = (key) => (e) => set(key)(e.target.value);

  // Changing priority moves the default deadline, unless a time was already picked
  const setPriority = (p) => {
    if (!p || (isVerbal && !VERBAL_PRIORITIES.includes(p))) return;
    setF((s) => ({ ...s, priority: p, requiredBy: timeTouched ? s.requiredBy : toLocalInput(Date.now() + DEFAULT_LEAD[p] * 60000) }));
  };

  const setDrug = (drug) => {
    setF((s) => ({ ...s, drug, route: drug?.allowedRoutes.length === 1 ? drug.allowedRoutes[0] : drug?.allowedRoutes.includes(s.route) ? s.route : '' }));
    setServerError('');
  };

  // ---- Live calculation & checks (same rules as the server) ----
  const dose = useMemo(() => calculateDose(f.drug, f.prescribed, f.weightKg, f.heightCm), [f.drug, f.prescribed, f.weightKg, f.heightCm]);
  const allergy = findAllergy(f.drug, f.allergies);
  const max = f.drug?.dosing.maxSingleDose;
  const overMax = dose.value != null && max != null && dose.value > max;
  const pctOfMax = dose.value != null && max ? Math.min(100, (dose.value / max) * 100) : 0;
  const deadline = f.requiredBy ? new Date(f.requiredBy) : null;
  const deadlineOk = deadline && deadline.getTime() > Date.now();

  const errors = {
    mrn: !f.mrn.trim(),
    name: !f.name.trim(),
    weightKg: dose.missing.includes('weight'),
    heightCm: dose.missing.includes('height'),
    drug: !f.drug,
    route: !f.route,
    prescribed: !(Number(f.prescribed) > 0) || overMax,
    requiredBy: !deadlineOk,
    ...(isVerbal && { prescriber: !prescriberId, readBack: !readBack }),
  };
  const blocked = Boolean(allergy) || overMax;
  const valid = !Object.values(errors).some(Boolean) && !blocked;
  const show = (k) => submitted && errors[k];

  const checks = [
    { label: t('orderForm.checks.patient'), state: f.mrn.trim() && f.name.trim() ? true : submitted ? false : null },
    { label: t('orderForm.checks.measurements'), state: f.drug ? !dose.missing.length && (f.drug.dosing.basis === 'fixed' || Number(f.weightKg) > 0) : null },
    { label: allergy ? t('orderForm.errors.allergy', { allergy }) : t('orderForm.checks.allergy'), state: f.drug ? !allergy : null },
    { label: t('orderForm.checks.maxDose'), state: dose.value != null ? !overMax : null },
    { label: t('orderForm.checks.deadline'), state: f.requiredBy ? Boolean(deadlineOk) : null },
    ...(isVerbal ? [
      { label: t('verbal.checkPrescriber'), state: prescriberId ? true : submitted ? false : null },
      { label: t('verbal.checkReadBack'), state: readBack ? true : submitted ? false : null },
    ] : []),
  ];

  // ---- Submit ----
  const submit = async (confirmDuplicate = false) => {
    setSubmitted(true);
    if (!valid) return;
    setSending(true);
    setServerError('');
    const num = (v) => (v === '' ? undefined : Number(v));
    const body = {
      drugId: f.drug._id,
      route: f.route,
      priority: f.priority,
      requiredBy: new Date(f.requiredBy).toISOString(),
      notes: f.notes.trim() || undefined,
      infusionDurationMin: num(f.durationMin),
      patient: { mrn: f.mrn.trim(), name: f.name.trim(), weightKg: num(f.weightKg), heightCm: num(f.heightCm), allergies: f.allergies },
      dose: { prescribedValue: Number(f.prescribed) },
      ...(f.diluentName.trim() && { diluent: { name: f.diluentName.trim(), volumeMl: num(f.diluentMl) } }),
      ...(confirmDuplicate && { confirmDuplicate: true }),
      ...(isVerbal && { verbalOrder: { prescriberId, readBack } }),
    };
    try {
      const { data } = await api.post('/orders', body);
      const o = data.order;
      notify({ kind: 'success', title: t(isVerbal ? 'verbal.created' : 'orderForm.created', { doctor: o.prescriberName }), body: `${o.drugSnapshot.name} ${o.dose.calculatedValue} ${o.dose.unit} · ${shortId(o.orderNumber)}` });
      navigate(HOME_BY_ROLE[user.role], { state: { created: o._id } });
    } catch (err) {
      const msg = errorMessage(err);
      if (err.response?.status === 409 && /duplicate/i.test(msg)) setDuplicate(msg);
      else setServerError(msg);
    } finally {
      setSending(false);
    }
  };

  // Numbers / MRN stay LTR inside Arabic, aligned to the reading side.
  // (Inline style on purpose: the RTL plugin mirrors sx/CSS, but not inline styles.)
  const ltrInput = { dir: 'ltr', style: { textAlign: theme.direction === 'rtl' ? 'right' : 'left' } };
  const numberField = (key, label, extra = {}) => (
    <TextField label={label} type="number" value={f[key]} onChange={onInput(key)} error={show(key)}
      slotProps={{ htmlInput: { ...ltrInput, min: 0, step: 'any', inputMode: 'decimal' } }} {...extra} />
  );

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 340px' }, gap: 2.5, alignItems: 'start' }}>
      <Stack spacing={2.5} component="form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Box>
          <Typography variant="h6">{t(isVerbal ? 'verbal.title' : 'orderForm.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('orderForm.subtitle')} · <Ltr>{user.department?.code}</Ltr>
          </Typography>
        </Box>

        {/* Verbal / telephone order: who gave it, and the read-back confirmation */}
        {isVerbal && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
            <Card sx={(th) => ({ p: { xs: 2, md: 2.5 }, border: '1.5px solid', borderColor: alpha(th.palette.warning.main, 0.5) })}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1 }}>
                <PhoneInTalkRounded sx={{ color: 'warning.main' }} />
                <Typography variant="subtitle1">{t('verbal.section')}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.7 }}>{t('verbal.rules')}</Typography>
              <TextField select label={t('verbal.prescriber')} value={prescriberId} onChange={(e) => { setPrescriberId(e.target.value); setServerError(''); }}
                error={show('prescriber')} helperText={!prescribers.length ? t('verbal.noDoctors') : ' '}>
                {prescribers.map((d) => (
                  <MenuItem key={d._id} value={d._id}>{d.fullName}{d.departmentCode && <>&nbsp;· <Ltr>{d.departmentCode}</Ltr></>}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel sx={{ mt: 0.5, alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.5 } }}
                control={<Checkbox checked={readBack} onChange={(e) => setReadBack(e.target.checked)} color="warning" />}
                label={<Typography variant="body2" sx={{ color: show('readBack') ? 'error.main' : 'text.primary', pt: 0.75 }}>{t('verbal.readBack')}</Typography>} />
            </Card>
          </motion.div>
        )}

        {loadError && <Alert severity="error" sx={{ borderRadius: 3 }}>{loadError}</Alert>}

        {/* 1. Patient */}
        <Section n={1} title={t('orderForm.sections.patient')} delay={0.05}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label={t('orderForm.fields.mrn')} value={f.mrn} onChange={(e) => set('mrn')(e.target.value.toUpperCase())} error={show('mrn')}
              placeholder="MRN-10001" slotProps={{ htmlInput: ltrInput }} />
            <TextField label={t('orderForm.fields.name')} value={f.name} onChange={onInput('name')} error={show('name')} slotProps={{ htmlInput: { dir: 'auto' } }} />
            {numberField('weightKg', t('orderForm.fields.weight'), { helperText: show('weightKg') ? t('orderForm.errors.required') : ' ' })}
            {numberField('heightCm', t('orderForm.fields.height'), { helperText: show('heightCm') ? t('orderForm.errors.required') : dose.bsa ? `BSA ${dose.bsa} m²` : ' ' })}
            <Autocomplete multiple freeSolo options={[]} value={f.allergies} onChange={(_, v) => set('allergies')(v.map((a) => a.trim()).filter(Boolean))}
              sx={{ gridColumn: '1 / -1' }}
              renderInput={(params) => (
                <TextField {...params} label={t('orderForm.fields.allergies')} helperText={t('orderForm.fields.allergiesHint')} error={Boolean(allergy)} />
              )} />
          </Box>
        </Section>

        {/* 2. Drug & route */}
        <Section n={2} title={t('orderForm.sections.drug')} delay={0.1}>
          <Stack spacing={2}>
            <Autocomplete options={drugs ?? []} loading={!drugs && !loadError} value={f.drug} onChange={(_, v) => setDrug(v)}
              groupBy={(d) => t(`category.${d.category}`)}
              getOptionLabel={(d) => d.name}
              getOptionDisabled={(d) => isVerbal && VERBAL_BLOCKED.includes(d.category)}
              isOptionEqualToValue={(a, b) => a._id === b._id}
              filterOptions={(opts, { inputValue }) => {
                const q = inputValue.trim().toLowerCase();
                return q ? opts.filter((d) => [d.name, d.genericName, d.code].some((s) => s?.toLowerCase().includes(q))) : opts;
              }}
              renderOption={({ key, ...props }, d) => (
                <Box component="li" key={key} {...props} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography dir="ltr" sx={{ fontSize: 14, fontWeight: 600, textAlign: 'left' }}>{d.name}</Typography>
                    <Typography variant="caption" color="text.secondary"><Ltr>{d.code} · {basisLabel(d)}{d.dosing.maxSingleDose != null ? ` · max ${d.dosing.maxSingleDose} ${d.dosing.unit}` : ''}</Ltr></Typography>
                  </Box>
                  {d.controlledSchedule && <Chip size="small" color="warning" variant="outlined" label={<Ltr>CII</Ltr>} />}
                  {isVerbal && VERBAL_BLOCKED.includes(d.category) && <Chip size="small" variant="outlined" label={t('verbal.doctorOnly')} />}
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} label={t('orderForm.fields.drug')} error={show('drug')}
                  sx={{ '& input': { direction: 'ltr', textAlign: 'left' } }} />
              )} />

            <AnimatePresence initial={false}>
              {f.drug && (
                <motion.div key="route" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                  <Typography variant="body2" color={show('route') ? 'error' : 'text.secondary'} sx={{ mb: 1 }}>{t('orderForm.fields.route')}</Typography>
                  <ToggleButtonGroup exclusive value={f.route} onChange={(_, v) => v && set('route')(v)} size="small" color="primary" sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: '10px !important', border: (th) => `1px solid ${th.palette.divider} !important`, px: 2 } }}>
                    {f.drug.allowedRoutes.map((r) => <ToggleButton key={r} value={r}><Ltr>{routeLabel(r)}</Ltr></ToggleButton>)}
                  </ToggleButtonGroup>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Chip size="small" variant="outlined" label={t(`orderForm.basis.${f.drug.dosing.basis}`)} />
                    <Chip size="small" variant="outlined" label={<>{t('orderForm.stableFor')} <Ltr>{f.drug.stability.beyondUseHours} h</Ltr></>} />
                    {f.drug.controlledSchedule && <Chip size="small" color="warning" variant="outlined" label={<>{t('orderForm.controlled')} <Ltr>{f.drug.controlledSchedule}</Ltr></>} />}
                  </Stack>
                </motion.div>
              )}
            </AnimatePresence>
          </Stack>
        </Section>

        {/* 3. Dose */}
        <Section n={3} title={t('orderForm.sections.dose')} delay={0.15}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {numberField('prescribed', t('orderForm.fields.prescribed'), {
              disabled: !f.drug,
              helperText: overMax ? t('orderForm.errors.overMax') : f.drug ? ' ' : t('orderForm.pickDrugFirst'),
              error: submitted ? errors.prescribed : overMax,
              slotProps: {
                htmlInput: { ...ltrInput, min: 0, step: 'any', inputMode: 'decimal' },
                input: { endAdornment: f.drug && <InputAdornment position="end"><Ltr>{basisLabel(f.drug)}</Ltr></InputAdornment> },
              },
            })}
            {INFUSION_ROUTES.includes(f.route)
              ? numberField('durationMin', t('orderForm.fields.duration'), { helperText: ' ' })
              : <Box sx={{ display: { xs: 'none', sm: 'block' } }} />}
            <TextField label={t('orderForm.fields.diluent')} value={f.diluentName} onChange={onInput('diluentName')} placeholder="NS 0.9%" slotProps={{ htmlInput: ltrInput }} />
            {numberField('diluentMl', t('orderForm.fields.volume'), { disabled: !f.diluentName.trim() })}
          </Box>
        </Section>

        {/* 4. Priority & timing */}
        <Section n={4} title={t('orderForm.sections.timing')} delay={0.2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25, mb: 2.5 }}>
            {['emergency', 'urgent', 'routine'].map((p) => {
              const active = f.priority === p;
              const locked = isVerbal && !VERBAL_PRIORITIES.includes(p);
              const c = PRIORITY_COLOR[p];
              return (
                <Box key={p} component={motion.button} type="button" whileTap={{ scale: locked ? 1 : 0.97 }} onClick={() => setPriority(p)} disabled={locked}
                  sx={(th) => ({
                    cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.45 : 1, font: 'inherit', textAlign: 'start', p: 1.5, borderRadius: 3, border: '1.5px solid',
                    borderColor: active ? th.palette[c].main : th.palette.divider,
                    bgcolor: active ? alpha(th.palette[c].main, th.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
                    color: active ? th.palette[c].main : 'text.primary', transition: 'all .2s',
                  })}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14, color: 'inherit' }}>{t(`priority.${p}`)}</Typography>
                  <Typography variant="caption" color="text.secondary">{locked ? t('verbal.routineLocked') : t(`orderForm.priorityHint.${p}`)}</Typography>
                </Box>
              );
            })}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
            <TextField type="datetime-local" label={t('orderForm.fields.requiredBy')} value={f.requiredBy}
              onChange={(e) => { setTimeTouched(true); set('requiredBy')(e.target.value); }}
              error={Boolean(f.requiredBy) && !deadlineOk} helperText={f.requiredBy && !deadlineOk ? t('orderForm.errors.past') : ' '}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: ltrInput }} />
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', pt: 1 }}>
              {QUICK.map((m) => (
                <Chip key={m} clickable variant="outlined" label={<Ltr>+{m < 60 ? `${m}m` : `${m / 60}h`}</Ltr>}
                  onClick={() => { setTimeTouched(true); set('requiredBy')(toLocalInput(Date.now() + m * 60000)); }} />
              ))}
            </Stack>
            <TextField label={t('orderForm.fields.notes')} value={f.notes} onChange={onInput('notes')} multiline minRows={2}
              slotProps={{ htmlInput: { maxLength: 1000, dir: 'auto' } }} sx={{ gridColumn: '1 / -1' }} />
          </Box>
        </Section>
      </Stack>

      {/* Live dose summary (sticky on desktop) */}
      <Box sx={{ position: { lg: 'sticky' }, top: { lg: 24 } }}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>{t('orderForm.summary.title')}</Typography>

            <Box sx={(th) => ({ p: 2, borderRadius: 3, mb: 2, textAlign: 'center',
              bgcolor: overMax || allergy ? alpha(th.palette.error.main, 0.1) : alpha(th.palette.primary.main, th.palette.mode === 'dark' ? 0.14 : 0.07) })}>
              <Typography variant="caption" color="text.secondary">{t('orderForm.summary.calculated')}</Typography>
              {f.drug && <Typography dir="ltr" sx={{ fontWeight: 600, fontSize: 14 }}>{f.drug.name}</Typography>}
              <AnimatePresence mode="wait">
                <motion.div key={dose.value ?? 'none'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, color: overMax ? 'error.main' : 'text.primary' }}>
                    {dose.value != null ? <Ltr>{dose.value.toLocaleString('en-US')} {f.drug.dosing.unit}</Ltr> : <span className="num">—</span>}
                  </Typography>
                </motion.div>
              </AnimatePresence>
              {dose.value != null && f.drug.dosing.basis !== 'fixed' && (
                <Typography variant="caption" color="text.secondary">
                  <Ltr>{f.prescribed} {basisLabel(f.drug)} × {f.drug.dosing.basis === 'bsa' ? `${dose.bsa} m²` : `${f.weightKg} kg`}</Ltr>
                </Typography>
              )}
              {!f.drug && <Typography variant="caption" color="text.secondary" component="div">{t('orderForm.summary.pickDrug')}</Typography>}
            </Box>

            {max != null && dose.value != null && (
              <Box sx={{ mb: 2 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">{t('orderForm.summary.max')}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: overMax ? 'error.main' : 'text.secondary' }}>
                    <Ltr>{Math.round((dose.value / max) * 100)}% · {max} {f.drug.dosing.unit}</Ltr>
                  </Typography>
                </Stack>
                <LinearProgress variant="determinate" value={pctOfMax} color={overMax ? 'error' : pctOfMax > 85 ? 'warning' : 'primary'}
                  sx={{ height: 6, borderRadius: 3, bgcolor: 'divider', '& .MuiLinearProgress-bar': { borderRadius: 3 } }} />
              </Box>
            )}

            <Box sx={{ mb: 2 }}>
              {checks.map((c) => <Check key={c.label} {...c} />)}
            </Box>

            <AnimatePresence>
              {serverError && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}><span dir="auto">{serverError}</span></Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div whileTap={{ scale: 0.98 }}>
              <Button fullWidth size="large" variant="contained" disabled={sending || blocked || !drugs} onClick={() => submit()}
                endIcon={!sending && <SendRounded sx={{ transform: theme.direction === 'rtl' ? 'scaleX(-1)' : 'none' }} />}
                color={f.priority === 'emergency' ? 'error' : 'primary'}>
                {sending ? <CircularProgress size={22} color="inherit" /> : t('orderForm.submit')}
              </Button>
            </motion.div>
            {submitted && !valid && !blocked && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>{t('orderForm.errors.incomplete')}</Typography>
            )}
          </Card>
        </motion.div>
      </Box>

      {/* Duplicate guard: server found an active order for this patient + drug */}
      <Dialog open={!!duplicate} onClose={() => setDuplicate('')} fullWidth maxWidth="xs">
        <DialogTitle>{t('orderForm.duplicate.title')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ borderRadius: 3 }}><span dir="auto">{duplicate}</span></Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setDuplicate('')}>{t('common.back')}</Button>
          <Button variant="contained" color="warning" onClick={() => { setDuplicate(''); submit(true); }}>{t('orderForm.duplicate.confirm')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}