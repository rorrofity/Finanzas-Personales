function createCardStatementController({getService=()=>require('../services/cardStatements/cardStatementService')}={}){
 function safeError(res,failure){const known=typeof failure?.code==='string'&&/^CARD_STATEMENT_[A-Z0-9_]{1,80}$/.test(failure.code)&&[400,401,403,404,409,413,422,429,500,502,503,504].includes(failure.status);return res.status(known?failure.status:500).json({error:failure?.status===403?'La conciliación solo está disponible para su titular.':'No se pudo consultar o procesar el estado de cuenta.',code:known?failure.code:'CARD_STATEMENT_INTERNAL_ERROR'});}
 return{
  async list(req,res){try{return res.json(await getService().list(req.actorId,req.query||{}))}catch(e){return safeError(res,e)}},
  async detail(req,res){try{return res.json(await getService().detail(req.actorId,req.params.id))}catch(e){return safeError(res,e)}},
  async ingest(req,res){try{if(!req.file)return res.status(400).json({error:'Adjunta un archivo PDF.',code:'CARD_STATEMENT_FILE_REQUIRED'});return res.json(await getService().ingest({buffer:req.file.buffer,filename:req.file.originalname||req.body?.filename,messageId:req.body?.messageId,attachmentId:req.body?.attachmentId,from:req.body?.from,subject:req.body?.subject}));}catch(e){return safeError(res,e)}}
 };
}
module.exports={createCardStatementController};
