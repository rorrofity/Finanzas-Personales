import { formatCLP, formatCLPExact, formatCLPShort, formatCLPThousands, formatPct } from '../format';

describe('formatCLPExact (importes persistidos sin redondear centavos)', () => {
  test('conserva hasta dos decimales sin añadir ceros a importes enteros', () => {
    expect(formatCLPExact(176.2)).toBe('$176,2');
    expect(formatCLPExact(176.25)).toBe('$176,25');
    expect(formatCLPExact(176)).toBe('$176');
    expect(formatCLPExact(-176.25)).toBe('-$176,25');
    expect(formatCLPExact(999999999.99)).toBe('$999.999.999,99');
  });
});

describe('formatCLP', () => {
  test('formatea CLP sin decimales', () => {
    expect(formatCLP(1234567)).toMatch(/1\.234\.567/);
  });
  test('null → $0', () => {
    expect(formatCLP(null)).toBe('$0');
  });
});

describe('formatCLPShort (M/K para ejes de gráficos)', () => {
  test('millones con 1 decimal', () => {
    expect(formatCLPShort(1800000)).toBe('$1.8M');
  });
  test('miles', () => {
    expect(formatCLPShort(45000)).toBe('$45K');
  });
});

describe('formatCLPThousands (resolución hasta el mil, para stat-cards)', () => {
  test('millones se muestran en miles con separador es-CL y sufijo K', () => {
    expect(formatCLPThousands(2543678)).toBe('$2.544K'); // redondeo al mil
    expect(formatCLPThousands(4800000)).toBe('$4.800K');
  });
  test('conserva el signo negativo', () => {
    expect(formatCLPThousands(-2300000)).toBe('-$2.300K');
  });
  test('decenas/centenas de miles con resolución de mil', () => {
    expect(formatCLPThousands(47997)).toBe('$48K');
  });
  test('montos bajo mil se muestran completos', () => {
    expect(formatCLPThousands(950)).toMatch(/950/);
  });
  test('cero', () => {
    expect(formatCLPThousands(0)).toBe('$0');
  });
});

describe('formatPct', () => {
  test('ratio → %', () => {
    expect(formatPct(0.223)).toBe('22%');
  });
  test('null → —', () => {
    expect(formatPct(null)).toBe('—');
  });
});
