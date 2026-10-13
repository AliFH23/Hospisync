import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import api from '../api/client';
import Ltr from './Ltr';
import { useSocketEvent } from '../socket/SocketProvider';

const STATUS_COLOR = { critical: 'error', reorder: 'warning', ok: 'success' };

export default function StockAdvisorCard() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api.get('/ai/stock').then(({ data: d }) => { setData(d); setError(false); }).catch(() => setError(true));
  }, []);

  useEffect(load, [load]);
  // A new AI alert means stock status changed → refresh the card
  useSocketEvent('ai:stock-alert', load);

  const items = data?.items.filter((i) => i.status !== 'ok').slice(0, 4) ?? [];

  return (
    <Card sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: 2, display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg,#3BC0B6,#6A7FDB)' }}>
          <AutoAwesomeRounded sx={{ fontSize: 17 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap sx={{ lineHeight: 1.3 }}>{t('nav.stock')}</Typography>
          {data && <Typography variant="caption" color="text.secondary">{t('stock.horizon', { days: data.horizonDays })}</Typography>}
        </Box>
      </Stack>

      {error && <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>{t('stock.offline')}</Alert>}

      {!data && !error && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={84} sx={{ mb: 1.25, borderRadius: 3 }} />)}

      {data && items.length === 0 && <Alert severity="success" variant="outlined" sx={{ borderRadius: 3 }}>{t('stock.allOk')}</Alert>}

      <Stack spacing={1.25}>
        {items.map((s, i) => {
          const cover = Math.min(100, ((s.daysOfCover ?? 0) / data.horizonDays) * 100);
          return (
            <motion.div key={s.drugId} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }}>
              <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: 'subtle' }}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{s.name}</Typography>
                  <Chip size="small" color={STATUS_COLOR[s.status]} variant="outlined" label={t(`stock.${s.status}`)} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  <Ltr>{s.onHand.toLocaleString('en-US')} {s.unit}</Ltr> · {t('stock.cover', { days: s.daysOfCover })}
                </Typography>
                <LinearProgress variant="determinate" value={cover} color={STATUS_COLOR[s.status]}
                  sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: 'divider', '& .MuiLinearProgress-bar': { borderRadius: 3 } }} />
                {s.recommendedOrder > 0 && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 600, color: 'primary.main' }}>
                    {t('stock.order')} <Ltr>{s.recommendedOrder.toLocaleString('en-US')} {s.unit}</Ltr>
                  </Typography>
                )}
              </Box>
            </motion.div>
          );
        })}
      </Stack>

      {data && <Button component={Link} to="/stock" size="small" sx={{ mt: 1.5 }}>{t('stock.viewAll')}</Button>}
    </Card>
  );
}