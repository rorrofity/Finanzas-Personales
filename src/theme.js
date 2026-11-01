import { createTheme } from '@mui/material/styles';

const baseOptions = {
  palette: {
    mode: 'light',
    primary: {
      main: '#3B82F6', // blue-500 suave
      light: '#DBEAFE',
      dark: '#2563EB',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#64748B', // slate-500
      light: '#CBD5E1',
      dark: '#475569',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#10B981', // emerald-500 suave
      dark: '#059669',
      light: '#D1FAE5',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#F59E0B', // amber-500
      dark: '#D97706',
      light: '#FEF3C7',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#EF4444', // red-500 suave
      dark: '#DC2626',
      light: '#FEE2E2',
      contrastText: '#FFFFFF',
    },
    grey: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
    },
    background: {
      default: '#F8FAFC', // slate-50
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1E293B', // slate-800
      secondary: '#64748B', // slate-500
    },
    divider: '#E2E8F0', // slate-200
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    h1: { fontSize: '2.25rem', fontWeight: 700 },
    h2: { fontSize: '1.875rem', fontWeight: 700 },
    h3: { fontSize: '1.5rem', fontWeight: 700 },
    h4: { fontSize: '1.25rem', fontWeight: 600 },
    h5: { fontSize: '1.125rem', fontWeight: 600 },
    h6: { fontSize: '1rem', fontWeight: 600 },
    body1: { fontSize: '0.95rem' },
    body2: { fontSize: '0.875rem' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontVariantNumeric: 'tabular-nums',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
};

/** The default export remains light for existing isolated component consumers. */
export function createAppTheme(mode = 'light') {
  const dark = mode === 'dark';
  const primary = dark ? '#79ABFF' : '#2563EB';
  return createTheme({
    ...baseOptions,
    palette: {
      ...baseOptions.palette,
      mode: dark ? 'dark' : 'light',
      primary: {
        main: primary,
        light: dark ? '#A8C9FF' : '#DBEAFE',
        dark: dark ? '#4A8EF3' : '#1D4ED8',
        contrastText: dark ? '#0B1220' : '#FFFFFF',
      },
      secondary: { main: dark ? '#B4C0D5' : '#475569', light: dark ? '#D6DFEC' : '#CBD5E1', dark: dark ? '#8F9EB6' : '#334155', contrastText: dark ? '#0B1220' : '#FFFFFF' },
      success: { main: dark ? '#61D6AE' : '#047857', light: dark ? '#A1E8CD' : '#D1FAE5', dark: dark ? '#28B88B' : '#065F46', contrastText: dark ? '#0B1220' : '#FFFFFF' },
      warning: { main: dark ? '#F7C977' : '#A16207', light: dark ? '#FBE3B9' : '#FEF3C7', dark: dark ? '#E3AB43' : '#854D0E', contrastText: dark ? '#0B1220' : '#FFFFFF' },
      error: { main: dark ? '#FF9C9C' : '#DC2626', light: dark ? '#FFC6C6' : '#FEE2E2', dark: dark ? '#F57575' : '#B91C1C', contrastText: dark ? '#0B1220' : '#FFFFFF' },
      background: { default: dark ? '#0B1220' : '#F8FAFC', paper: dark ? '#121D30' : '#FFFFFF' },
      text: { primary: dark ? '#E8EFF9' : '#1E293B', secondary: dark ? '#B5C2D8' : '#64748B' },
      divider: dark ? '#30405A' : '#E2E8F0',
      action: { hover: dark ? 'rgba(121,171,255,0.08)' : 'rgba(37,99,235,0.05)', selected: dark ? 'rgba(121,171,255,0.16)' : 'rgba(37,99,235,0.1)' },
    },
    components: {
      ...baseOptions.components,
      MuiCssBaseline: {
        styleOverrides: {
          ...baseOptions.components.MuiCssBaseline.styleOverrides,
          '::selection': { backgroundColor: dark ? '#385A90' : '#DBEAFE', color: dark ? '#FFFFFF' : '#172554' },
          'input, textarea': { caretColor: primary },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { ...baseOptions.components.MuiPaper.styleOverrides.root, backgroundImage: 'none', boxShadow: dark ? '0 2px 8px rgba(0,0,0,0.22)' : '0 1px 3px rgba(15,23,42,0.08)' } },
      },
      MuiButtonBase: { styleOverrides: { root: { '&.Mui-focusVisible': { outline: `2px solid ${primary}`, outlineOffset: 3 } } } },
    },
  });
}

const theme = createAppTheme('light');

export default theme;
