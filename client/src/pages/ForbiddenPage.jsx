import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LockRounded from '@mui/icons-material/LockRounded';
import { useAuth, HOME_BY_ROLE } from '../auth/AuthContext';

export default function ForbiddenPage({ notFound = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
        <LockRounded sx={{ fontSize: 56, color: 'text.disabled' }} />
        <Typography variant="h5" sx={{ mt: 1 }}>{t(notFound ? 'errors.notFound' : 'errors.forbidden')}</Typography>
        <Button component={Link} to={user ? HOME_BY_ROLE[user.role] : '/login'} variant="contained" sx={{ mt: 3 }}>
          {t('errors.back')}
        </Button>
      </motion.div>
    </Box>
  );
}