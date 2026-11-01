const path=require('path');
const childProcess=require('child_process');
const {error}=require('./errors');
function createPdfExtractor({env=process.env,spawn=childProcess.spawn}={}){
  return ({buffer,filename})=>new Promise((resolve,reject)=>{
    if(!env.CARD_STATEMENTS_PDF_PASSWORD){reject(error(503,'NOT_CONFIGURED'));return;}
    let child;
    try{child=spawn(env.CARD_STATEMENTS_PYTHON||'python3',[path.join(__dirname,'extract_statement.py')],{shell:false,stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONIOENCODING:'utf-8'}});}catch(_){reject(error(502,'EXTRACTION_FAILED'));return;}
    const chunks=[];let outputBytes=0,done=false,live=true;
    const finish=(failure,result)=>{if(done)return;done=true;clearTimeout(timer);if(failure){if(live){try{child.kill('SIGKILL')}catch(_){}}reject(failure);}else resolve(result);};
    const timer=setTimeout(()=>finish(error(504,'TIMEOUT')),45000);
    child.stdout.on('data',chunk=>{if(done)return;const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,'utf8');outputBytes+=bytes.length;if(outputBytes>4*1024*1024){finish(error(502,'OUTPUT_TOO_LARGE'));return;}chunks.push(bytes);});
    child.stderr.on('data',()=>{});
    child.on('error',()=>finish(error(502,'EXTRACTION_FAILED')));
    child.stdin.on('error',()=>finish(error(502,'EXTRACTION_FAILED')));
    child.on('close',code=>{
      live=false;if(done)return;
      try{const result=JSON.parse(Buffer.concat(chunks,outputBytes).toString('utf8'));if(code!==0||result?.error){const value=result?.error?.code;const suffix=typeof value==='string'&&/^STATEMENT_[A-Z0-9_]{1,64}$/.test(value)?value.slice(10):'EXTRACTION_FAILED';finish(error(422,suffix));}else finish(null,result);}catch(_){finish(error(502,'EXTRACTION_FAILED'));}
    });
    child.stdin.end(JSON.stringify({pdfBase64:buffer.toString('base64'),password:env.CARD_STATEMENTS_PDF_PASSWORD,filename}));
  });
}
module.exports={createPdfExtractor};
