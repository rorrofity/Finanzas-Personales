const db = require('../config/database');
const { readFinancialCommitments } = require('../services/financialCommitmentsService');

/** Same pure projection/parent-card calculation used by Financial Health. */
async function computeCommitments(userId, targetYear, targetMonth, { query = db.query } = {}) {
  const result = await readFinancialCommitments(userId, targetYear, targetMonth, { query });
  return {
    ...result.legacy,
    total: result.totalCommitments,
    conversionPendingCount: result.conversionPendingCount,
    amountsPartial: result.partialReasons.length > 0,
  };
}

module.exports = { computeCommitments };
