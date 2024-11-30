import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#afccc7',
      light: '#e2e7e3',
      dark: '#a3b1b2',
      contrastText: '#958673',
    },
    secondary: {
      main: '#958673',
      light: '#b7a691',
      dark: '#756757',
    },
    background: {
      default: '#e2e7e3',
      paper: '#ffffff',
    },
    text: {
      primary: '#958673',
      secondary: '#a3b1b2',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500,
      color: '#958673',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
      color: '#958673',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
      color: '#958673',
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      color: '#958673',
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      color: '#958673',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      color: '#958673',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
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
});

export default theme;
