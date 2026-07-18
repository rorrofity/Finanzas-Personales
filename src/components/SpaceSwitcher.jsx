import React from 'react';
import { FormControl, MenuItem, Select } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { useSpace } from '../contexts/SpaceContext';

/**
 * Selector de espacio activo (Req 11.13).
 * Solo visible cuando el usuario tiene acceso a más de un espacio.
 */
const SpaceSwitcher = () => {
  const { spaces, activeSpace, switchSpace } = useSpace();

  if (spaces.length < 2) return null;

  return (
    <FormControl size="small" sx={{ mr: 2, minWidth: 150 }}>
      <Select
        value={activeSpace?.ownerId || ''}
        onChange={(e) => switchSpace(e.target.value)}
        SelectDisplayProps={{ 'data-testid': 'space-switcher' }}
        startAdornment={<HomeIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />}
        sx={{ fontSize: '0.875rem' }}
      >
        {spaces.map((s) => (
          <MenuItem key={s.ownerId} value={s.ownerId}>
            {s.isOwner ? 'Mi espacio' : `Hogar de ${s.ownerName}`}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

export default SpaceSwitcher;
