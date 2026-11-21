'use strict';
// Consulta privada dos convites vinculados ao usuário. Não altera dados.
const core = require('./core');
function pending(g,userId,now=Date.now()){
 const results=[];
 for(const card of core.list(g)){
  if(card.status==='pending' && card.expiresAt>=now && card.leaderId!==userId && card.members.some(m=>m.userId===userId&&!m.accepted)){
   results.push({card,kind:'initial',expiresAt:card.expiresAt,type:'normal',originShift:card.shift});
  }
  const join=card.joinInvites?.[userId];
  if(card.status==='active' && join && join.expiresAt>=now && !card.members.some(m=>m.userId===userId)){
   results.push({card,kind:'join',expiresAt:join.expiresAt,type:join.type,originShift:join.originShift});
  }
 }
 return results.sort((a,b)=>a.expiresAt-b.expiresAt || a.card.id.localeCompare(b.card.id));
}
module.exports={pending};
