import React from 'react';
import { Chip } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';

/**
 * Indicador discreto de quién registró una transacción (Req 11.12).
 * El padre decide mostrarlo solo cuando el espacio tiene >1 participante.
 */
const CreatedByChip = ({ name }) => {
  if (!name) return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<PersonOutlineIcon />}
      label={name}
      sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' } }}
    />
  );
};

export default CreatedByChip;
