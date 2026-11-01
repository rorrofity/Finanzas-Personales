class CardStatementError extends Error {
  constructor(status, code, message='No se pudo procesar el estado de cuenta.') { super(message); this.name='CardStatementError'; this.status=status; this.code=code; }
}
const error=(status,suffix,message)=>new CardStatementError(status,`CARD_STATEMENT_${suffix}`,message);
module.exports={CardStatementError,error};
