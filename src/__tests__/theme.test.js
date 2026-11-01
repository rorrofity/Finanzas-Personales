import theme, { createAppTheme } from '../theme';

const luminance = (hex) => {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (foreground, background) => {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};

test('mantiene el tema claro por defecto para consumidores existentes', () => {
  expect(theme.palette.mode).toBe('light');
});

test.each(['light', 'dark'])('%s ofrece fondos y texto legibles en superficies principales', (mode) => {
  const appTheme = createAppTheme(mode);
  expect(appTheme.palette.mode).toBe(mode);
  for (const background of Object.values(appTheme.palette.background)) {
    expect(contrast(appTheme.palette.text.primary, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(appTheme.palette.text.secondary, background)).toBeGreaterThanOrEqual(4.5);
  }
});

test('el modo oscuro define superficies oscuras y foco visible', () => {
  const dark = createAppTheme('dark');
  expect(dark.palette.background.default).toBe('#0B1220');
  expect(luminance(dark.palette.background.paper)).toBeLessThan(.1);
  expect(contrast(dark.palette.primary.main, dark.palette.background.paper)).toBeGreaterThanOrEqual(3);
});
