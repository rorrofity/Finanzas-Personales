import React, { useState } from 'react';
import { Box, Tab, Tabs } from '@mui/material';

/**
 * Tabs segmentados que muestran un solo gráfico a la vez (Epic 12, Req 12.5).
 * `tabs`: [{ label, content }]. Solo se monta el contenido activo.
 */
const ChartTabs = ({ tabs = [] }) => {
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;

  return (
    <Box>
      <Tabs
        value={active}
        onChange={(_, v) => setActive(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ minHeight: 40, mb: 1, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}
      >
        {tabs.map((t, i) => (
          <Tab key={t.label} label={t.label} value={i} />
        ))}
      </Tabs>
      <Box>{tabs[active]?.content}</Box>
    </Box>
  );
};

export default ChartTabs;
