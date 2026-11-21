'use strict';
const { RANK_THRESHOLDS, MODULES }=require('./config');
function list(g,module,status=null) {
  return Object.values(g.dutyCards||{}).filter(c=>c.module===module && (!status || c.status===status));
}
function ongoing(g,module,userId) {return list(g,module).find(c=>c.userId===userId && ['active','paused'].includes(c.status)) || null;}
function workedMs(c,now=Date.now()) {
  return Math.max(0,c.workMs||0)+(c.status==='active' && Number.isFinite(c.activeSince)?Math.max(0,now-c.activeSince):0);
}
function start(g,module,userId,id,now=Date.now(),serviceRoleId=null) {
  if (!MODULES[module]) throw new Error('Módulo RP inválido.');
  if (ongoing(g,module,userId)) throw new Error('Já existe cartão aberto para este integrante.');
  const c={id,module,userId,startedAt:now,activeSince:now,endedAt:null,pausedAt:null,pausedMs:0,workMs:0,status:'active',serviceRoleId};
  g.dutyCards[id]=c;return c;
}
function serviceRoleFor(card, configuredRole=null) {
  return card?.serviceRoleId || configuredRole || null;
}
function pause(g,id,by,now=Date.now()) {
  const c=g.dutyCards[id];if(!c || c.status!=='active') throw new Error('Selecione um cartão em serviço.');
  c.workMs=workedMs(c,now);c.activeSince=null;c.pausedAt=now;c.status='paused';c.pausedBy=by;return c;
}
function resume(g,id,by,now=Date.now()) {
  const c=g.dutyCards[id];if(!c || c.status!=='paused') throw new Error('Selecione um cartão pausado.');
  c.pausedMs+=Math.max(0,now-(c.pausedAt??now));c.pausedAt=null;c.activeSince=now;c.status='active';c.resumedBy=by;return c;
}
function finish(g,id,now=Date.now()) {
  const c=g.dutyCards[id];if(!c || !['active','paused'].includes(c.status)) throw new Error('Não há cartão aberto.');
  if(c.status==='active') c.workMs=workedMs(c,now);
  else c.pausedMs+=Math.max(0,now-(c.pausedAt??now));
  c.activeSince=null;c.pausedAt=null;c.endedAt=now;c.status='ended';return c;
}
function cancel(g,id,by,now=Date.now()) {
  const c=g.dutyCards[id];if(!c || c.status==='canceled') throw new Error('Cartão não encontrado ou já cancelado.');
  c.status='canceled';c.activeSince=null;c.pausedAt=null;c.canceledAt=now;c.canceledBy=by;return c;
}
function ranking(g,module,now=Date.now()) {
  const map=new Map();
  for(const c of list(g,module)) {
    if(c.status==='canceled') continue;
    map.set(c.userId,(map.get(c.userId)||0)+workedMs(c,now));
  }
  return [...map].map(([userId,totalMs])=>({userId,totalMs})).sort((a,b)=>b.totalMs-a.totalMs);
}
function rankTier(ms, thresholds=RANK_THRESHOLDS) {
  const mins=ms/60000;
  return mins>=thresholds[2]?3:mins>=thresholds[1]?2:mins>=thresholds[0]?1:0;
}
function formatMs(ms) {return `${Math.floor(ms/3600000)}h ${String(Math.floor(ms%3600000/60000)).padStart(2,'0')}m`;}
module.exports={list,ongoing,workedMs,start,serviceRoleFor,pause,resume,finish,cancel,ranking,rankTier,formatMs};
