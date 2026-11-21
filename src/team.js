'use strict';
function list(g,module){return Object.values(g.teams||{}).filter(t=>t.module===module);}
function busy(g,module,userId){return list(g,module).find(t=>['pending','active','paused'].includes(t.status)&&t.members.includes(userId))||null;}
function startInvite(g,{id,module,leaderId,name,invitees,now=Date.now(),expiryMs=15*60000}){
 const clean=String(name||'').trim();if(clean.length<3||clean.length>45)throw Error('Nome da equipe: 3 a 45 caracteres.');
 if(!Array.isArray(invitees)||invitees.length<1||invitees.length>3||new Set(invitees).size!==invitees.length||invitees.includes(leaderId))throw Error('Convide de 1 a 3 integrantes: a equipe deve ter de 2 a 4 pessoas, incluindo o líder.');
 for(const u of [leaderId,...invitees])if(busy(g,module,u))throw Error('Alguém selecionado já está em outra equipe com cartão aberto.');
 const t={id,module,name:clean,leaderId,members:[leaderId,...invitees],accepted:[leaderId],status:'pending',createdAt:now,expiresAt:now+expiryMs,startedAt:null,activeSince:null,workMs:0,pausedAt:null,pausedMs:0,endedAt:null,serviceRoleId:null};
 g.teams[id]=t;return t;
}
function accept(g,id,userId,now=Date.now()){
 const t=g.teams[id];if(!t||t.status!=='pending')throw Error('Convite não está mais disponível.');
 if(now>t.expiresAt){t.status='expired';throw Error('O convite expirou; peça para o líder criar outro.');}
 if(!t.members.includes(userId))throw Error('Você não foi convidado para essa equipe.');
 if(!t.accepted.includes(userId))t.accepted.push(userId);
 return {team:t,allAccepted:t.accepted.length===t.members.length};
}
function launch(g,id,roleId,now=Date.now()){
 const t=g.teams[id];if(!t||t.status!=='pending'||t.accepted.length!==t.members.length||t.members.length<2)throw Error('Todos os integrantes precisam aceitar antes do início.');
 t.status='active';t.startedAt=now;t.activeSince=now;t.serviceRoleId=roleId||null;return t;
}
function workedMs(t,now=Date.now()){return (t.workMs||0)+(t.status==='active'?Math.max(0,now-(t.activeSince||now)):0);}
function pause(g,id,by,now=Date.now()){
 const t=g.teams[id];if(!t||t.status!=='active')throw Error('Equipe não está ativa.');
 t.workMs=workedMs(t,now);t.activeSince=null;t.pausedAt=now;t.status='paused';t.pausedBy=by;return t;
}
function resume(g,id,by,now=Date.now()){
 const t=g.teams[id];if(!t||t.status!=='paused')throw Error('Equipe não está em pausa.');
 t.pausedMs+=(now-(t.pausedAt||now));t.pausedAt=null;t.activeSince=now;t.status='active';t.resumedBy=by;return t;
}
function finish(g,id,now=Date.now()){
 const t=g.teams[id];if(!t||!['active','paused'].includes(t.status))throw Error('Equipe sem ponto ativo.');
 if(t.status==='active')t.workMs=workedMs(t,now);else t.pausedMs+=(now-(t.pausedAt||now));
 t.status='ended';t.endedAt=now;t.activeSince=null;t.pausedAt=null;return t;
}
function cancel(g,id,by,now=Date.now()){
 const t=g.teams[id];if(!t||t.status==='canceled')throw Error('Cartão não encontrado ou já cancelado.');
 t.status='canceled';t.canceledBy=by;t.canceledAt=now;t.activeSince=null;t.pausedAt=null;return t;
}
function ranking(g,module,now=Date.now()){
 const data=new Map();for(const t of list(g,module)){
  if(t.status==='canceled'||t.status==='pending'||t.status==='expired')continue;
  for(const u of t.members)data.set(u,(data.get(u)||0)+workedMs(t,now));
 }
 return [...data].map(([userId,ms])=>({userId,ms})).sort((a,b)=>b.ms-a.ms);
}
function format(ms){return `${Math.floor(ms/3600000)}h ${String(Math.floor(ms%3600000/60000)).padStart(2,'0')}m`;}
module.exports={list,busy,startInvite,accept,launch,workedMs,pause,resume,finish,cancel,ranking,format};
