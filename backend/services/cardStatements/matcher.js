const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const commerce = value => normalize(value).replace(/\b(?:compra|compras|pago|con|tarjeta|credito|debito)\b/g, ' ').replace(/\s+/g, ' ').trim();
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
function cents(value) {
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return ((match[1] ? -1n : 1n) * (BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0')))).toString();
}
function compatible(left, right) {
  const a = commerce(left), b = commerce(right);
  return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)))));
}
const sourceKey = value => `${value.sourceType}:${value.id}`;
function finding(status, reason, candidates = [], periodMismatch = false) {
  const unique = candidates.length === 1 ? candidates[0] : null;
  return { status, reason, candidateCount: candidates.length, sourceType: unique?.sourceType || null,
    sourceId: unique ? String(unique.id) : null, periodMismatch };
}
function matchStatement(document, sources, { revisionConflict = false } = {}) {
  const used = new Set();
  const dueYear = Number(String(document.dueDate || '').slice(0, 4));
  const dueMonth = Number(String(document.dueDate || '').slice(5, 7));
  const sections = document.sections.map(section => {
    const groups = new Map();
    for (const item of section.items) {
      const key = [item.currency, item.date, item.cardLastFour || '', item.kind, cents(item.amount), commerce(item.description), item.installmentNumber || ''].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const items = section.items.map(item => {
      if (['payment', 'debt_transfer', 'other_credit'].includes(item.kind)) {
        return { ...item, finding: finding('informational', item.kind) };
      }
      if (!validDay(item.date) || cents(item.amount) === null || !['CLP', 'USD'].includes(item.currency)) {
        return { ...item, finding: finding('review', 'invalid_item') };
      }
      const isInstallment = item.kind === 'installment';
      const candidates = sources.filter(source => {
        if (used.has(sourceKey(source)) || source.currency !== item.currency || cents(source.amount) !== cents(item.amount)) return false;
        if (source.network && document.network && source.network !== document.network) return false;
        if (source.cardLastFour && item.cardLastFour && source.cardLastFour !== item.cardLastFour) return false;
        if (isInstallment) return source.sourceType === 'installment' && Number(source.installmentNumber) === Number(item.installmentNumber);
        if (source.sourceType === 'installment' || !validDay(source.date)) return false;
        if (source.type && !['gasto', 'desestimar'].includes(source.type)) return false;
        return Math.abs(Date.parse(source.date + 'T00:00:00Z') - Date.parse(item.date + 'T00:00:00Z')) <= 86400000;
      });
      const groupKey = [item.currency, item.date, item.cardLastFour || '', item.kind, cents(item.amount), commerce(item.description), item.installmentNumber || ''].join('|');
      if ((groups.get(groupKey) || []).length > 1 && candidates.length) {
        return { ...item, finding: finding('review', 'ambiguous_multiplicity', candidates) };
      }
      if (!candidates.length) return { ...item, finding: finding('missing', 'not_found') };
      const descriptions = candidates.filter(candidate => compatible(item.description, candidate.description));
      if (!descriptions.length) return { ...item, finding: finding('review', 'description_difference', candidates) };
      if (descriptions.length !== 1) return { ...item, finding: finding('review', 'multiple_candidates', descriptions) };
      const source = descriptions[0];
      const mismatch = Number(source.billingYear) !== dueYear || Number(source.billingMonth) !== dueMonth;
      const competing = section.items.filter(other => {
        if (['payment','debt_transfer','other_credit'].includes(other.kind) || other.currency !== item.currency || cents(other.amount) !== cents(source.amount) || !compatible(other.description,source.description)) return false;
        if(other.cardLastFour && source.cardLastFour && other.cardLastFour !== source.cardLastFour) return false;
        if(other.kind==='installment') return source.sourceType==='installment' && Number(other.installmentNumber)===Number(source.installmentNumber);
        return source.sourceType!=='installment' && validDay(other.date) && validDay(source.date)
          && Math.abs(Date.parse(other.date+'T00:00:00Z')-Date.parse(source.date+'T00:00:00Z'))<=86400000;
      });
      if(competing.length>1)return {...item,finding:finding('review','ambiguous_multiplicity',descriptions,mismatch)};
      if(source.providerKnown===false)return {...item,finding:finding('review','bank_identity_missing',descriptions,mismatch)};
      if (!source.network || !document.network) return { ...item, finding: finding('review', 'network_unknown', descriptions, mismatch) };
      if (!item.cardLastFour || !source.cardLastFour) return { ...item, finding: finding('review', 'card_identity_missing', descriptions, mismatch) };
      if (!isInstallment && item.date !== source.date) return { ...item, finding: finding('review', 'posting_date_difference', descriptions, mismatch) };
      if (mismatch) return { ...item, finding: finding('review', 'billing_period_difference', descriptions, true) };
      if (source.type === 'desestimar') return { ...item, finding: finding('review', 'manually_excluded', descriptions) };
      used.add(sourceKey(source));
      return { ...item, finding: finding('matched', 'unique_identity_match', descriptions) };
    });
    return { ...section, items, counts: items.reduce((counts, item) => { counts[item.finding.status] += 1; return counts; }, { matched: 0, missing: 0, review: 0, informational: 0 }) };
  });
  const valid = document.validation?.valid === true && sections.every(section => section.validation?.valid === true);
  const review = revisionConflict || sections.some(section => section.counts.missing || section.counts.review || section.counts.informational);
  return { ...document, sections, revisionConflict, status: !valid ? 'invalid' : review ? 'review' : 'ready' };
}
module.exports = { matchStatement, normalizeDescription: normalize, amountsEqual: (a, b) => cents(a) !== null && cents(a) === cents(b) };
