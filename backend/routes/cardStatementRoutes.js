const express=require('express');
const multer=require('multer');
const crypto=require('crypto');
const {createCardStatementController}=require('../controllers/cardStatementController');
function createIngestGuard(env=process.env){return(req,res,next)=>{
 const expected=env.CARD_STATEMENTS_INGEST_SECRET;
 if(typeof expected!=='string'||!expected)return res.status(503).json({error:'La recepción de estados no está configurada.',code:'CARD_STATEMENT_NOT_CONFIGURED'});
 const header=req.headers?.authorization,provided=typeof header==='string'&&header.startsWith('Bearer ')?header.slice(7):'';
 const digest=value=>crypto.createHash('sha256').update(value).digest();
 if(!provided||provided.length>1024||!crypto.timingSafeEqual(digest(provided),digest(expected)))return res.status(401).json({error:'Recepción no autorizada.',code:'CARD_STATEMENT_UNAUTHORIZED'});
 return next();
};}
function createCardStatementRouter({env=process.env,controller=createCardStatementController(),authMiddleware,spaceMiddleware,ownerMiddleware}={}){
 const router=express.Router();
 router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');res.setHeader('Vary','Authorization, X-Space-Owner');next();});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:8,fieldSize:8192},fileFilter:(req,file,callback)=>{
  if(!['application/pdf','application/octet-stream'].includes(file.mimetype)||!/\.pdf$/i.test(file.originalname||'')){const error=new Error('PDF required');error.code='CARD_STATEMENT_INVALID_PDF';error.status=400;callback(error);return;}callback(null,true);
 }});
 router.post('/ingest',createIngestGuard(env),upload.single('file'),controller.ingest||((req,res)=>res.status(503).end()));
 router.use(authMiddleware||require('../middleware/auth').auth,spaceMiddleware||require('../middleware/resolveSpace').resolveSpace,ownerMiddleware||require('../middleware/requirePermission').requireOwner);
 router.use(function configuredOwner(req,res,next){const owner=env.CARD_STATEMENTS_OWNER_USER_ID||env.FINTOC_OWNER_USER_ID;if(!owner||req.actorId!==owner)return res.status(403).json({error:'La conciliación solo está disponible para su titular.',code:'CARD_STATEMENT_FORBIDDEN'});next();});
 router.get('/',controller.list||((req,res)=>res.status(503).end()));
 router.get('/:id',controller.detail||((req,res)=>res.status(503).end()));
 router.use((req,res)=>{res.setHeader('Allow','GET');res.status(req.method==='GET'?404:405).json({error:'Consulta no disponible.',code:req.method==='GET'?'CARD_STATEMENT_NOT_FOUND':'CARD_STATEMENT_METHOD_NOT_ALLOWED'});});
 router.use((failure,req,res,next)=>{const large=failure?.code==='LIMIT_FILE_SIZE',known=failure?.code==='CARD_STATEMENT_INVALID_PDF';return res.status(large?413:400).json({error:large?'El PDF supera el tamaño permitido.':'No se pudo recibir el PDF.',code:large?'CARD_STATEMENT_FILE_TOO_LARGE':known?failure.code:'CARD_STATEMENT_INVALID_UPLOAD'});});
 return router;
}
module.exports={createCardStatementRouter,createIngestGuard};
