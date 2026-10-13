import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { STATUS_COLOR, PRIORITY_COLOR } from '../theme/tokens';

// Soft "dot + label" chip: tinted background, colored text (calm, but still scannable)
function SoftChip({ color, label }) {
  return (
    <Chip size="small" label={label}
      icon={<Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor', ml: '10px !important' }} />}
      sx={(t) => ({
        color: t.palette[color].main,
        bgcolor: t.palette.mode === 'dark' ? alpha(t.palette[color].main, 0.16) : t.palette[color].light ?? alpha(t.palette[color].main, 0.12),
        '& .MuiChip-icon': { color: 'inherit' },
        transition: 'background-color .3s, color .3s',
      })} />
  );
}

export function StatusChip({ status }) {
  const { t } = useTranslation();
  return <SoftChip color={STATUS_COLOR[status]} label={t(`status.${status}`)} />;
}

export function PriorityChip({ priority }) {
  const { t } = useTranslation();
  return <SoftChip color={PRIORITY_COLOR[priority]} label={t(`priority.${priority}`)} />;
}