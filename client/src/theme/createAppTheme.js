import { createTheme, alpha } from '@mui/material/styles';
import { palettes } from './tokens';

export function createAppTheme(mode, direction) {
  const p = palettes[mode];
  const font = direction === 'rtl'
    ? '"Cairo", "Inter", system-ui, sans-serif'
    : '"Inter", "Cairo", system-ui, sans-serif';

  return createTheme({
    direction,
    palette: { mode, ...p },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: font,
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 700 },
      subtitle1: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shadows: [
      'none',
      `0 1px 2px ${alpha('#14324A', 0.04)}, 0 4px 16px ${alpha('#14324A', mode === 'dark' ? 0.3 : 0.06)}`,
      ...Array(23).fill(`0 10px 30px ${alpha('#14324A', mode === 'dark' ? 0.45 : 0.16)}`),
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { WebkitFontSmoothing: 'antialiased' },
          // Clinical values (doses, MRN, order numbers) always use tabular Western digits
          '.num': { fontVariantNumeric: 'tabular-nums' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { defaultProps: { elevation: 1 }, styleOverrides: { root: { borderRadius: 18 } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 10, paddingInline: 16 } },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 20 } } },
      MuiTextField: { defaultProps: { fullWidth: true } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
      // MUI's default dark "standard" alert is almost black: use a soft tint of the severity color instead
      MuiAlert: {
        styleOverrides: {
          root: ({ ownerState, theme }) => (mode === 'dark' && (ownerState.variant ?? 'standard') === 'standard'
            ? { backgroundColor: alpha(theme.palette[ownerState.severity ?? 'success'].main, 0.12), color: theme.palette.text.primary }
            : {}),
        },
      },
    },
  });
}