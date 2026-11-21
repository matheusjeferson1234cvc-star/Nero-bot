'use strict';
// Alterações de cargos do servidor destinadas exclusivamente ao RP.
const ID_RE=/^\d{17,20}$/;
function normalizedRoleList(roles) {
  if(!Array.isArray(roles)) throw new Error('Seleção de cargos inválida.');
  const unique=[...new Set(roles.map(String))];
  if(unique.length>5 || unique.some(id=>!ID_RE.test(id))) throw new Error('Selecione até 5 cargos válidos por operação.');
  return unique;
}
function planMovement({mode,targetId,addRoles=[],removeRoles=[],reason}){
  if(!['promocao','rebaixamento'].includes(mode)) throw new Error('Movimentação inválida.');
  if(!ID_RE.test(String(targetId||''))) throw new Error('Selecione um integrante do Discord.');
  const add=normalizedRoleList(addRoles), remove=normalizedRoleList(removeRoles);
  if(!add.length&&!remove.length)throw new Error('Selecione um cargo para adicionar ou remover.');
  if(add.some(id=>remove.includes(id)))throw new Error('Um cargo não pode ser adicionado e removido na mesma movimentação.');
  const message=String(reason||'').trim();
  if(message.length<5||message.length>400)throw new Error('Informe um motivo de 5 a 400 caracteres.');
  return {mode,targetId:String(targetId),addRoles:add,removeRoles:remove,reason:message};
}
function saveMovement(g,record){
  if(!record?.id || !record?.module)throw new Error('Movimentação incompleta.');
  g.movements??={};if(g.movements[record.id])throw new Error('Protocolo duplicado.');
  g.movements[record.id]={...record};return g.movements[record.id];
}
function recentMovements(g,module,max=10){
  return Object.values(g.movements||{}).filter(x=>x.module===module)
    .sort((a,b)=>b.createdAt-a.createdAt).slice(0,Math.max(1,Math.min(max,25)));
}
module.exports={normalizedRoleList,planMovement,saveMovement,recentMovements};
