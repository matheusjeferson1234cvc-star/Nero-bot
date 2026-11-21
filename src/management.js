'use strict';
function configuredRanks(panel){return (panel.roles.patentes||[]).map((id,slot)=>({id,slot})).filter(x=>!!x.id);}
function movePlan(panel,memberRoleIds,mode){
 const ranks=configuredRanks(panel);if(!ranks.length)throw Error('Configure as patentes e os cargos na engrenagem de Gestão.');
 const current=ranks.filter(r=>memberRoleIds.includes(r.id)).sort((a,b)=>b.slot-a.slot)[0];
 if(mode!=='promocao'&&mode!=='rebaixamento')throw Error('Tipo de mudança inválido.');
 const position=current?ranks.findIndex(r=>r.slot===current.slot):-1;
 const next=mode==='promocao'?Math.min(position+1,ranks.length-1):position-1;
 if(mode==='promocao' && next===position)throw Error('Integrante já está na patente máxima configurada.');
 if(mode==='rebaixamento' && position===-1)throw Error('Integrante não possui patente configurada.');
 const add=next>=0?[ranks[next].id]:[];
 const remove=ranks.filter(r=>memberRoleIds.includes(r.id)&&!add.includes(r.id)).map(r=>r.id);
 return {add,remove,from:current?.slot??null,to:next<0?null:ranks[next].slot};
}
function warningPlan(panel,userRecord){
 const level=Math.min((userRecord?.count||0)+1,3);
 if((userRecord?.count||0)>=3)throw Error('Integrante já foi exonerado após três advertências.');
 const allWarn=panel.roles.advertencias.filter(Boolean);const nextRole=panel.roles.advertencias[level-1];
 const remove=[...allWarn.filter(r=>r!==nextRole)];
 if(level===3)remove.push(...panel.roles.patentes.filter(Boolean),...(panel.roles.exonerarExtra||[]),panel.roles.integrante);
 return {level,add:[nextRole,...(level===3?[panel.roles.exonerado]:[])].filter(Boolean),remove:[...new Set(remove.filter(Boolean))],exonerate:level===3};
}
function ensureRoleChangeAllowed(guild,actor,bot,roleIds){
 for(const id of [...new Set(roleIds.filter(Boolean))]){
  const role=guild.roles.cache.get(id);if(!role||role.managed||role.id===guild.id)throw Error('Cargo inválido ou gerenciado por integração.');
  if(bot.roles.highest.comparePositionTo(role)<=0)throw Error(`O cargo ${role.name} está acima ou igual ao cargo do bot.`);
  if(guild.ownerId!==actor.id&&actor.roles.highest.comparePositionTo(role)<=0)throw Error(`Você não pode editar o cargo ${role.name}.`);
 }
}
module.exports={configuredRanks,movePlan,warningPlan,ensureRoleChangeAllowed};
