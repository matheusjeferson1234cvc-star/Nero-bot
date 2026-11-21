'use strict';
// Só mapeia atalhos explícitos. A autorização e a publicação continuam em index.js.
const COMMAND_PANELS = Object.freeze({
  painelbateponto: 'plantao',
  painelregistro: 'registro',
  painelrecrutamento: 'recrutamento',
  penielrecrutamento: 'recrutamento',
  'gestão': 'gestao',
});
function quickPanelType(name) { return COMMAND_PANELS[name] || null; }
module.exports = { COMMAND_PANELS, quickPanelType };
