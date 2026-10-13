import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

// Temporary screen until each dashboard is built (next steps)
export default function PlaceholderPage({ titleKey }) {
  const { t } = useTranslation();
  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card><CardContent><Skeleton width="45%" /><Skeleton variant="text" sx={{ fontSize: 32 }} width="30%" /></CardContent></Card>
          </motion.div>
        ))}
      </Box>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6">{t(`nav.${titleKey}`)}</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>{t('common.comingSoon')}</Typography>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={52} sx={{ mb: 1, borderRadius: 3 }} />)}
          </CardContent>
        </Card>
      </motion.div>
    </Stack>
  );
}