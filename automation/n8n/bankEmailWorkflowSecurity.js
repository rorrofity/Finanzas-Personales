'use strict';

/** Bind credential references only. Secret values never enter versioned workflow code. */
function secureBankEmailWorkflow(workflow, credential) {
  if (!workflow || !Array.isArray(workflow.nodes) || !credential
    || Object.keys(credential).sort().join(',') !== 'id,name'
    || typeof credential.id !== 'string' || !credential.id
    || typeof credential.name !== 'string' || !credential.name) {
    throw new Error('Invalid bank workflow credential reference');
  }
  const next = JSON.parse(JSON.stringify(workflow));
  const webhooks = next.nodes.filter(node => node.type === 'n8n-nodes-base.webhook');
  if (webhooks.length !== 1 || webhooks[0].parameters?.path !== 'sync-bank-emails'
    || webhooks[0].parameters?.httpMethod !== 'POST') {
    throw new Error('Unexpected bank webhook shape');
  }
  const targets = next.nodes.filter(node => node.type === 'n8n-nodes-base.httpRequest'
    && typeof node.parameters?.url === 'string'
    && /\/api\/(?:cards\/mapping|sync\/sync-save(?:-intl)?)(?:\?|$)/.test(node.parameters.url));
  if (targets.some(node => !/^=?http:\/\/(?:172\.17\.0\.1|127\.0\.0\.1|localhost):3001\/api\//.test(node.parameters.url))) {
    throw new Error('Bank callback must target the private backend');
  }
  if (!targets.some(node => /\/api\/cards\/mapping(?:\?|$)/.test(node.parameters.url))
    || !targets.some(node => /\/api\/sync\/sync-save(?:-intl)?(?:\?|$)/.test(node.parameters.url))) {
    throw new Error('Missing bank mapping or ingest callback');
  }
  for (const node of [webhooks[0], ...targets]) {
    if (node.credentials && Object.keys(node.credentials).some(key => key !== 'httpHeaderAuth')) {
      throw new Error('Unexpected existing bank authentication');
    }
    node.credentials = { httpHeaderAuth: { ...credential } };
    if (node === webhooks[0]) node.parameters.authentication = 'headerAuth';
    else {
      node.parameters.authentication = 'genericCredentialType';
      node.parameters.genericAuthType = 'httpHeaderAuth';
    }
  }
  next.settings = { ...next.settings,
    saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none',
    saveExecutionProgress: false, saveManualExecutions: false };
  return next;
}

module.exports = { secureBankEmailWorkflow };
