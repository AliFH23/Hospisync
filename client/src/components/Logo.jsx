import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Brand mark: never mirrored in RTL (inline styles are not touched by the RTL style plugin)
export default function Logo({ size = 34, light = false }) {
  const ring = Math.max(2, size / 11);
  return (
    <Box dir="ltr" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
      <span aria-hidden style={{
        width: size, height: size, flex: 'none', position: 'relative', display: 'inline-block',
        borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: '#3BC0B6',
      }}>
        <span style={{
          position: 'absolute', inset: size * 0.26, borderRadius: '50%',
          border: `${ring}px solid #fff`, borderRightColor: 'transparent',
        }} />
      </span>
      <Typography component="span" sx={{ fontWeight: 800, fontSize: size * 0.6, letterSpacing: '-0.02em', color: light ? '#fff' : 'text.primary', fontFamily: 'Inter, sans-serif' }}>
        Hospi<span style={{ color: '#3BC0B6' }}>sync</span>
      </Typography>
    </Box>
  );
}