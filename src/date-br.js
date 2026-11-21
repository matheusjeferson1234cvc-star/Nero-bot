'use strict';
// Data de entrada e saída em pt-BR. Persistência continua ISO (AAAA-MM-DD).
function parseDateBR(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (year < 2000 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month-1, day, 12));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month-1 || d.getUTCDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function formatDateBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '—');
}
module.exports = {parseDateBR,formatDateBR};
