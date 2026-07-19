import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

/**
 * Contenedor de sección con título overline y densidad estándar
 * (Epic 12, Req 12.9).
 */
const SectionCard = ({ title, action, children, sx }) => (
  <Card variant="outlined" sx={{ ...sx }}>
    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
      {(title || action) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          {title && (
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
              {title}
            </Typography>
          )}
          {action}
        </Box>
      )}
      {children}
    </CardContent>
  </Card>
);

export default SectionCard;
