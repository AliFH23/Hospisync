// Design tokens: calm clinical palette, tuned for long shifts (no pure white / pure black).
// Strong colors are reserved for meaning: red = emergency/critical, amber = urgent/expiring, green = ready.

export const palettes = {
  light: {
    background: { default: '#F3F6F7', paper: '#FFFFFF' },
    text: { primary: '#1F2D3D', secondary: '#5F6F7E', disabled: '#9AA8B3' },
    divider: '#E6ECEE',
    primary: { main: '#0F8B8D', light: '#E3F2F1', dark: '#0B6E70', contrastText: '#FFFFFF' },
    secondary: { main: '#3D5A80', contrastText: '#FFFFFF' },
    error: { main: '#D64545', light: '#FBEAEA' },
    warning: { main: '#D9822B', light: '#FBF0E4' },
    success: { main: '#2E9E6B', light: '#E5F4EC' },
    info: { main: '#3D5A80', light: '#E8EEF5' },
    sidebar: { bg: '#14324A', text: '#A9BDC9', active: '#FFFFFF', accent: '#3BC0B6' },
    subtle: '#F3F6F7',
  },
  dark: {
    background: { default: '#0F1A22', paper: '#152430' },
    text: { primary: '#E3EAEF', secondary: '#9DB0BE', disabled: '#5E7383' },
    divider: '#22323E',
    primary: { main: '#3BC0B6', light: '#163A3C', dark: '#2A9A92', contrastText: '#0B2230' },
    secondary: { main: '#8FB3C2', contrastText: '#0B151C' },
    error: { main: '#F07B7B', light: '#3A1F23' },
    warning: { main: '#F0AE63', light: '#3A2D1C' },
    success: { main: '#5CCB98', light: '#15362A' },
    info: { main: '#8FB3C2', light: '#1C2E38' },
    sidebar: { bg: '#0B151C', text: '#8FA7B6', active: '#FFFFFF', accent: '#3BC0B6' },
    subtle: '#1A2A36',
  },
};

// Order status and priority → palette key (used by StatusChip / PriorityChip)
export const STATUS_COLOR = { pending: 'info', preparing: 'warning', ready: 'success', delivered: 'secondary', cancelled: 'error' };
export const PRIORITY_COLOR = { emergency: 'error', urgent: 'warning', routine: 'info' };