import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
  Avatar,
  Menu,
  MenuItem,
  Badge,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Receipt as ReceiptIcon,
  Person as PersonIcon,
  Category as CategoryIcon,
  ChevronLeft as ChevronLeftIcon,
  Warning as WarningIcon,
  MonetizationOn as HealthIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { getSuspiciousCount } from '../services/suspiciousService';

const drawerWidth = 240;

const DashboardLayout = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);
  const [suspiciousCount, setSuspiciousCount] = useState(0);

  // Cargar conteo de transacciones sospechosas
  useEffect(() => {
    const loadSuspiciousCount = async () => {
      try {
        const count = await getSuspiciousCount();
        setSuspiciousCount(count);
      } catch (error) {
        console.error('Error cargando conteo de sospechosos:', error);
      }
    };

    loadSuspiciousCount();
    // Actualizar cada 30 segundos
    const interval = setInterval(loadSuspiciousCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setDesktopOpen(!desktopOpen);
    }
  };

  const handleProfileMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: '💰 Salud Financiera', icon: <HealthIcon color="primary" />, path: '/financial-health' },
    { text: 'Transacciones No Facturadas (TC)', icon: <ReceiptIcon />, path: '/transactions' },
    { text: 'Transacciones No Facturadas Internacionales (TC)', icon: <ReceiptIcon />, path: '/transactions-intl' },
    { text: 'Compras en Cuotas (TC)', icon: <ReceiptIcon />, path: '/installments' },
    { text: 'Cuenta Corriente', icon: <ReceiptIcon />, path: '/checking' },
    { text: 'Transacciones Proyectadas', icon: <ReceiptIcon />, path: '/projected-transactions' },
    { text: 'Categorías', icon: <CategoryIcon />, path: '/categories' },
    { 
      text: 'Revisar Duplicados', 
      icon: <Badge badgeContent={suspiciousCount} color="warning"><WarningIcon /></Badge>, 
      path: '/review-duplicates' 
    },
    { text: 'Perfil', icon: <PersonIcon />, path: '/profile' },
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="toggle drawer"
            onClick={handleDrawerToggle}
            edge="start"
            sx={{ marginRight: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Finanzas Personales
          </Typography>
          <IconButton onClick={handleProfileMenu} sx={{ padding: 0 }}>
            <Avatar
              alt={user?.nombre}
              src={user?.profile_picture || undefined}
              sx={{ bgcolor: theme.palette.primary.main }}
            >
              {user?.nombre?.[0]}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleCloseMenu}
            onClick={handleCloseMenu}
          >
            <MenuItem onClick={() => navigate('/profile')}>Mi Perfil</MenuItem>
            <MenuItem onClick={handleLogout}>Cerrar Sesión</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      {/* Drawer para móvil */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            backgroundColor: theme.palette.background.default,
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItemButton
                key={item.text}
                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                sx={{ minHeight: 48, px: 2.5 }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 3, justifyContent: 'center' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* Drawer para escritorio */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: desktopOpen ? drawerWidth : theme.spacing(7),
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: desktopOpen ? drawerWidth : theme.spacing(7),
            boxSizing: 'border-box',
            backgroundColor: theme.palette.background.default,
            borderRight: `1px solid ${theme.palette.divider}`,
            overflowX: 'hidden',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map((item) => (
              <ListItemButton
                key={item.text}
                onClick={() => navigate(item.path)}
                sx={{
                  minHeight: 48,
                  justifyContent: desktopOpen ? 'initial' : 'center',
                  px: 2.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: desktopOpen ? 3 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  sx={{ opacity: desktopOpen ? 1 : 0 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1, sm: 2, md: 3 },
          backgroundColor: theme.palette.background.default,
          minHeight: '100vh',
          width: { xs: '100%', md: `calc(100% - ${desktopOpen ? drawerWidth : theme.spacing(7)}px)` },
          ml: { xs: 0, md: desktopOpen ? `${drawerWidth}px` : theme.spacing(7) },
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default DashboardLayout;
