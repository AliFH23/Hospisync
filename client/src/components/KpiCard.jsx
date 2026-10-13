import { useEffect, useRef, useState } from 'react';
import { animate, motion } from 'framer-motion';
import Card from '@mui/material/Card';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';

/** Number that counts up/down smoothly when it changes */
export function AnimatedNumber({ value }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const controls = animate(prev.current, value, { duration: 0.6, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return <span className="num">{shown}</span>;
}

export default function KpiCard({ label, value, hint, color = 'info', icon, index = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.4 }}>
      <Card sx={{ p: 2.25, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={(t) => ({
          width: 46, height: 46, borderRadius: 3, display: 'grid', placeItems: 'center', flex: 'none',
          color: t.palette[color].main, bgcolor: alpha(t.palette[color].main, t.palette.mode === 'dark' ? 0.16 : 0.1),
        })}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>{label}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}><AnimatedNumber value={value} /></Typography>
            {hint && <Typography variant="caption" sx={{ fontWeight: 600, color: `${color}.main` }} noWrap>{hint}</Typography>}
          </Box>
        </Box>
      </Card>
    </motion.div>
  );
}