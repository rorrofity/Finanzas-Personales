/** Versioned orchestration only: Gmail/PDF passwords and API keys never live here. */
function splitStatementAttachments(items) {
  const sender='enviodigital@bancochile.cl';
  const expectedSubject='Estado de Cuenta Tarjeta de Crédito';
  const result=[];
  function header(json,name){
    const headers=json.payload?.headers||json.headers;
    if(Array.isArray(headers))return headers.find(h=>String(h.name).toLowerCase()===name)?.value;
    if(headers&&typeof headers==='object'){const key=Object.keys(headers).find(k=>k.toLowerCase()===name);return key?headers[key]:undefined}
    return undefined;
  }
  function address(value){
    if(value&&typeof value==='object'){
      if(Array.isArray(value.value))return value.value.length===1?String(value.value[0].address||'').trim().toLowerCase():'';
      return typeof value.address==='string'?value.address.trim().toLowerCase():'';
    }
    if(typeof value!=='string')return '';
    const match=value.match(/^[^<>]*<([^<>]+)>\s*$/);
    const candidate=(match?match[1]:value).trim().toLowerCase();
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(candidate)?candidate:'';
  }
  for(const item of items||[]){
    const json=item.json||{};
    const from=address(json.from||json.From||header(json,'from'));
    const subject=String(json.subject||json.Subject||header(json,'subject')||'').normalize('NFC').trim();
    const messageId=typeof json.id==='string'?json.id:'';
    if(from!==sender||subject!==expectedSubject||!messageId)continue;
    for(const [key,binary]of Object.entries(item.binary||{})){
      if(!binary||typeof binary!=='object')continue;
      const filename=String(binary.fileName||'statement.pdf');
      if(binary.mimeType!=='application/pdf'&&!/\.pdf$/i.test(filename))continue;
      result.push({json:{messageId,attachmentId:String(binary.attachmentId||key),filename,from,subject},binary:{data:binary}});
    }
  }
  return result;
}
function summarizeResults(items){
  return(items||[]).map(item=>{const value=item.json?.statement||item.json?.result||item.json||{};
    return{json:{statementId:value.id||null,status:value.status||'received',network:value.network||null,
      duplicate:value.duplicate===true,
      sections:Array.isArray(value.sections)?value.sections.map(section=>({scope:section.scope,currency:section.currency,counts:section.counts||{}})):[]}};
  });
}
function createCardStatementWorkflow({gmailCredential={id:'__GMAIL_CREDENTIAL_ID__',name:'Gmail existente'},headerCredential={id:'__INGEST_CREDENTIAL_ID__',name:'Finanzas - Ingesta de estados'},ingestUrl='https://finanzas.rocketflow.cl/api/card-statements/ingest'}={}){
  if(!/^https:\/\/[^\s]+\/api\/card-statements\/ingest$/.test(ingestUrl))throw new Error('Invalid statement ingest URL');
  const query='from:enviodigital@bancochile.cl subject:"Estado de Cuenta Tarjeta de Crédito" has:attachment filename:pdf';
  const gmail={gmailOAuth2:{id:gmailCredential.id,name:gmailCredential.name}};
  const nodes=[
    {id:'csr-manual',name:'Revisar dos últimos estados',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,260],parameters:{}},
    {id:'csr-schedule',name:'Revisar cartolas del 25 al 30',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.3,position:[0,0],parameters:{rule:{interval:[{field:'cronExpression',expression:'0 0 23 25-30 * *'}]}}},
    {id:'csr-scheduled-recent',name:'Buscar cartolas recientes',type:'n8n-nodes-base.gmail',typeVersion:2.1,position:[240,0],parameters:{resource:'message',operation:'getAll',returnAll:true,simple:true,filters:{q:query+' newer_than:40d',readStatus:'both'}},credentials:gmail},
    {id:'csr-recent',name:'Buscar dos últimos estados',type:'n8n-nodes-base.gmail',typeVersion:2.1,position:[240,260],parameters:{resource:'message',operation:'getAll',returnAll:false,limit:2,simple:true,filters:{q:query,readStatus:'both'}},credentials:gmail},
    {id:'csr-download',name:'Descargar mensaje y adjuntos',type:'n8n-nodes-base.gmail',typeVersion:2.1,position:[500,0],parameters:{resource:'message',operation:'get',messageId:'={{ $json.id }}',simple:false,options:{downloadAttachments:true,dataPropertyAttachmentsPrefixName:'attachment_'}},credentials:gmail},
    {id:'csr-pdfs',name:'Validar correo y separar PDF',type:'n8n-nodes-base.code',typeVersion:2,position:[740,0],parameters:{jsCode:`return (${splitStatementAttachments.toString()})($input.all());`}},
    {id:'csr-ingest',name:'Conciliar en Finanzas',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[980,0],parameters:{method:'POST',url:ingestUrl,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,contentType:'multipart-form-data',bodyParameters:{parameters:[{parameterType:'formBinaryData',name:'file',inputDataFieldName:'data'},...['messageId','attachmentId','filename','from','subject'].map(name=>({name,value:`={{ $json.${name} }}`}))]},options:{timeout:90000,response:{response:{responseFormat:'json'}}}},credentials:{httpHeaderAuth:{id:headerCredential.id,name:headerCredential.name}}},
    {id:'csr-summary',name:'Resultado de conciliación',type:'n8n-nodes-base.code',typeVersion:2,position:[1220,0],parameters:{jsCode:`return (${summarizeResults.toString()})($input.all());`}},
  ];
  const edge=(node)=>({main:[[{node,type:'main',index:0}]]});
  return{name:'Finanzas - Conciliar estados Visa y Mastercard',nodes,connections:{'Revisar dos últimos estados':edge('Buscar dos últimos estados'),'Buscar dos últimos estados':edge('Descargar mensaje y adjuntos'),'Revisar cartolas del 25 al 30':edge('Buscar cartolas recientes'),'Buscar cartolas recientes':edge('Descargar mensaje y adjuntos'),'Descargar mensaje y adjuntos':edge('Validar correo y separar PDF'),'Validar correo y separar PDF':edge('Conciliar en Finanzas'),'Conciliar en Finanzas':edge('Resultado de conciliación')},settings:{timezone:'America/Santiago',executionOrder:'v1',saveExecutionProgress:false,saveManualExecutions:false,saveDataErrorExecution:'none',saveDataSuccessExecution:'none',executionTimeout:180}};
}
module.exports={createCardStatementWorkflow,splitStatementAttachments,summarizeResults};
