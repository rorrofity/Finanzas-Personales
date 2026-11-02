'use strict';

const DOMAIN = 'finanzas.rocketflow.cl';
const LOG_PATH = '/var/log/caddy/finanzas.log';
const DELETE_FIELDS = ['request>headers>X-Finanzas-Sync-Key delete', 'request>headers>x-finanzas-sync-key delete'];
const invalid = () => new Error('CADDY_SYNC_LOG_CONFIGURATION_INVALID');

// Caddy braces in comments/quoted strings are not block delimiters. Placeholder
// braces balance naturally and never alter the nesting depth of a whole line.
function scan(source, stop) {
  let depth = 0, quote = null, comment = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (comment) { if (character === '\n') comment = false; continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\' && quote !== '`') { escaped = true; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '#') { comment = true; continue; }
    if (character === '"' || character === '`') { quote = character; continue; }
    if (stop(i, depth, character)) return { index: i, depth };
    if (character === '{') depth++;
    if (character === '}') { depth--; if (depth < 0) throw invalid(); }
  }
  if (quote || depth !== 0) throw invalid();
  return { index: source.length, depth };
}
function depthAt(source, position) { return scan(source, i => i === position).depth; }
function blockEnd(source, opening) {
  const found = scan(source.slice(opening), (i, depth, character) => i > 0 && character === '}' && depth === 1);
  if (found.index === source.length - opening) throw invalid();
  return opening + found.index + 1;
}
function canonical(value) { return value.replace(/#[^\n]*/g, '').replace(/\s+/g, ' ').trim(); }

/** Only the known finance logger is modified. No credential value is accepted. */
function secureCaddySyncLogs(source) {
  if (typeof source !== 'string' || !source || source.length > 1024 * 1024) throw invalid();
  scan(source, () => false);
  const sites = [...source.matchAll(/^[ \t]*finanzas\.rocketflow\.cl[ \t]*\{/gm)];
  if (sites.length !== 1 || depthAt(source, sites[0].index) !== 0) throw invalid();
  const opening = source.indexOf('{', sites[0].index), ending = blockEnd(source, opening);
  const site = source.slice(opening + 1, ending - 1);
  const logs = [...site.matchAll(/^[ \t]*log(?:[ \t]+[A-Za-z0-9_.-]+)?[ \t]*\{/gm)];
  if (logs.length !== 1 || depthAt(site, logs[0].index) !== 0) throw invalid();
  const logOpening = site.indexOf('{', logs[0].index), logEnding = blockEnd(site, logOpening);
  const log = site.slice(logOpening + 1, logEnding - 1);
  const outputs = [...log.matchAll(/^[ \t]*output[ \t]+([^\r\n#]+)/gm)];
  if (outputs.length !== 1 || !/^file[ \t]+(?:"\/var\/log\/caddy\/finanzas\.log"|\/var\/log\/caddy\/finanzas\.log)[ \t]*$/.test(outputs[0][1])) throw invalid();
  if (/^[ \t]*(?:hostnames|no_hostname)\b/m.test(log)) throw invalid();
  const formats = [...log.matchAll(/^([ \t]*)format[ \t]+([A-Za-z0-9_]+)([^\r\n]*)/gm)];
  if (formats.length !== 1) throw invalid();
  const format = formats[0], indent = format[1], newline = source.includes('\r\n') ? '\r\n' : '\n';
  const replacement = [`${indent}format filter {`, `${indent}    wrap json`, `${indent}    fields {`, ...DELETE_FIELDS.map(field => `${indent}        ${field}`), `${indent}    }`, `${indent}}`].join(newline);
  if (format[2] === 'filter') {
    const formatOpening = log.indexOf('{', format.index), formatEnding = blockEnd(log, formatOpening);
    if (canonical(log.slice(format.index, formatEnding)) !== canonical(replacement)) throw invalid();
    return source;
  }
  if (format[2] !== 'json' || format[3].trim()) throw invalid();
  const offset = opening + 1 + logOpening + 1 + format.index;
  return source.slice(0, offset) + replacement + source.slice(offset + format[0].length);
}
module.exports = { secureCaddySyncLogs, DOMAIN, LOG_PATH };
