'use strict';
// Regras puras para as novas ferramentas de equipe RP. Não dependem de Discord.
function parseBRDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
  if (!match) throw new Error('Use uma data no formato DD/MM/AAAA.');
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2020 || year > 2100 || date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    throw new Error('Data inválida. Confira dia, mês e ano.');
  }
  return date.getTime();
}
function validateAbsence(fields) {
  const start = parseBRDate(fields['Início']); const end = parseBRDate(fields['Fim']);
  if (end < start) throw new Error('O término da ausência não pode ser anterior ao início.');
  if ((end - start) / 86400000 > 90) throw new Error('A ausência RP deve ter no máximo 90 dias.');
  return { start, end };
}
function getProfile(g, module, userId, duty) {
  const entries = Object.values(g.applications || {}).filter(a => a.module === module && a.userId === userId);
  const points = duty.list(g, module).filter(c => c.userId === userId);
  return {
    requests: entries.length, pending: entries.filter(a => a.status === 'pendente').length,
    approved: entries.filter(a => a.status === 'aprovado').length,
    workedMs: points.filter(c => c.status !== 'canceled').reduce((sum, c) => sum + duty.workedMs(c), 0),
    closedPoints: points.filter(c => c.status === 'ended').length,
    currentPoint: duty.ongoing(g,module,userId),
    warnings: Object.values(g.warnings || {}).filter(w => w.module === module && w.target === userId).length,
    promotions: Object.values(g.movements || {}).filter(m=>m.module===module&&m.targetId===userId&&m.mode==='promocao').length,
    demotions: Object.values(g.movements || {}).filter(m=>m.module===module&&m.targetId===userId&&m.mode==='rebaixamento').length,
  };
}
function audit(g, module, action, actor, target = '') {
  g.auditEvents ??= [];
  g.auditEvents.push({ ts: Date.now(), module, action: String(action).slice(0,72), actor, target: String(target).slice(0,100) });
  if (g.auditEvents.length > 1000) g.auditEvents.splice(0, g.auditEvents.length - 1000);
}
module.exports = { parseBRDate, validateAbsence, getProfile, audit };
