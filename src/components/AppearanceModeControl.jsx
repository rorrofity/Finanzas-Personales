import React, { useId, useState } from 'react';
import { Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAppearance } from '../contexts/AppearanceContext';

const options = [
  { value: 'light', label: 'Claro', icon: LightModeIcon },
  { value: 'dark', label: 'Oscuro', icon: DarkModeIcon },
  { value: 'system', label: 'Automático', icon: SettingsBrightnessIcon },
];

export default function AppearanceModeControl({ compact = false }) {
  const { preference, setPreference } = useAppearance();
  const [anchor, setAnchor] = useState(null);
  const menuId = useId();
  const current = options.find((option) => option.value === preference) || options[2];
  const Icon = current.icon;
  const controlProps = {
    'aria-label': 'Apariencia',
    'aria-haspopup': 'menu',
    'aria-expanded': Boolean(anchor),
    'aria-controls': anchor ? menuId : undefined,
    onClick: (event) => setAnchor(event.currentTarget),
  };

  return <>
    {compact ? <Tooltip title={`Apariencia: ${current.label}`}><IconButton {...controlProps} color="inherit" sx={{ flexShrink: 0, mr: 0.5, minWidth: 44, minHeight: 44 }}><Icon /></IconButton></Tooltip>
      : <Button {...controlProps} color="inherit" startIcon={<Icon />} endIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>Apariencia: {current.label}</Button>}
    <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} MenuListProps={{ 'aria-label': 'Elegir apariencia' }}>
      {options.map((option) => {
        const OptionIcon = option.icon;
        return <MenuItem key={option.value} role="menuitemradio" aria-checked={preference === option.value} selected={preference === option.value} onClick={() => { setPreference(option.value); setAnchor(null); }}>
          <ListItemIcon><OptionIcon fontSize="small" /></ListItemIcon><ListItemText>{option.label}</ListItemText>
        </MenuItem>;
      })}
    </Menu>
  </>;
}
