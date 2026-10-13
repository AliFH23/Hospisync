import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import TranslateIcon from '@mui/icons-material/Translate';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../theme/PreferencesProvider';

export default function PreferenceToggles() {
  const { t } = useTranslation();
  const { mode, toggleMode, lang, setLang } = usePreferences();

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Button size="small" variant="outlined" color="inherit" startIcon={<TranslateIcon fontSize="small" />}
        onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
        sx={{ borderColor: 'divider', color: 'text.secondary', fontFamily: lang === 'ar' ? 'Inter' : 'Cairo' }}>
        {t('common.language')}
      </Button>
      <Tooltip title={mode === 'light' ? t('common.darkMode') : t('common.lightMode')}>
        <IconButton onClick={toggleMode} sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={mode} style={{ display: 'flex' }}
              initial={{ y: -16, opacity: 0, rotate: -90 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: 16, opacity: 0, rotate: 90 }} transition={{ duration: 0.2 }}>
              {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
            </motion.span>
          </AnimatePresence>
        </IconButton>
      </Tooltip>
    </Stack>
  );
}