'use strict';

const SHIFTS = Object.freeze({manha:'🌅 Manhã',tarde:'☀️ Tarde',noite:'🌙 Noite',madrugada:'🌌 Madrugada'});
const OPEN = ['pending','active','paused'];
const ids = values => [...new Set((values||[]).filter(Boolean))];
function defaultSettings(){
 const windows={manha:['06:00','12:00'],tarde:['12:00','18:00'],noite:['18:00','00:00'],madrugada:['00:00','06:00']};
 return {
  notifications:{pointDm:true,receiptImage:false},
  timezone:'America/Sao_Paulo',pointMode:'team',serviceRoleId:null,auditChannelId:null,presenceLogChannelId:null,logCategoryId:null,pointEventsChannelId:null,cancelLogChannelId:null,presenceReportsEnabled:true,inviteMinutes:15,minMembers:2,maxMembers:4,
  justifications:{reviewChannelId:null,logChannelId:null,warningChannelId:null,warningRoles:[null,null,null],panel:null,autoWarnings:false,panelVisual:{title:'Justificativa de ausência',description:'Solicite a análise de uma ausência pela Central de Horas.',customGif:null}},
  shifts:Object.fromEntries(Object.entries(windows).map(([id,[start,end]])=>[id,{start,end,roleIds:[],supervisorRoles:[],logChannelId:null}])),
  panel:{title:'🕒 CENTRAL DE PONTO',description:'🟢 **Iniciar / Encerrar** · Monte a equipe e registre o serviço.\n⏯️ **Pausar / Retornar** · Controle a contagem de horas.\n👥 **Gerenciar equipe** · Convide membros do seu turno.\n📋 **Meus pontos** · Consulte cartões e tempo trabalhado.',customGif:null,published:null}
 };
}
function defaultGuild(){return {settings:defaultSettings(),cards:{},nextNumber:1,audit:[],justifications:{},nextJustification:1,attendance:{rosters:{},days:{},processed:{},streaks:{},warningLevels:{},warnings:{},presenceReports:{},presenceReportStartedAt:0,nextWarning:1,enabledAfterDate:'9999-12-31'},siteOff:{data:{weekly:{all:[0]},dates:[]},syncedAt:0}};}
function padGuild(g){
 const base=defaultSettings();g.settings??={};g.cards??={};g.audit??=[];g.nextNumber??=1;g.justifications??={};g.nextJustification??=1;g.siteOff??={data:{weekly:{all:[0]},dates:[]},syncedAt:0};g.attendance??={};
 for(const key of ['rosters','days','processed','streaks','warningLevels','warnings','presenceReports'])g.attendance[key]??={};
 g.attendance.nextWarning??=1;g.attendance.enabledAfterDate??='9999-12-31';g.attendance.presenceReportStartedAt??=0;
 const existing=g.settings;g.settings={...base,...existing,shifts:{}};
 for(const id of Object.keys(SHIFTS)){
  const old=existing.shifts?.[id]||{};
  const migrated=ids([...(old.roleIds||[]),...(old.roleId?[old.roleId]:[])]);
  g.settings.shifts[id]={...base.shifts[id],...old,roleIds:migrated};
  delete g.settings.shifts[id].roleId;
 }
 g.settings.panel={...base.panel,...existing.panel};
 g.settings.notifications={...base.notifications,...existing.notifications,receiptImage:false}; // Envio em imagem descontinuado; manter legado apenas para compatibilidade.
 g.settings.justifications={...base.justifications,...(existing.justifications||{})};
 g.settings.justifications.panelVisual={...base.justifications.panelVisual,...(existing.justifications?.panelVisual||{})};
 if(!Array.isArray(g.settings.justifications.warningRoles)||g.settings.justifications.warningRoles.length!==3)g.settings.justifications.warningRoles=[null,null,null];
 if(!['team','individual'].includes(g.settings.pointMode))g.settings.pointMode='team';
 // Migrar apenas títulos/descrições originais; preservar personalização do administrador.
 if(g.settings.panel.title==='⏱️ Central de Bate-Ponto')g.settings.panel.title=base.panel.title;
 if(g.settings.panel.description==='👥 Monte sua equipe, aguarde os aceites e acompanhe suas horas por turno.')g.settings.panel.description=base.panel.description;
 if(g.settings.panel.description==='🟢 **𝗜𝗻𝗶𝗰𝗶𝗮𝗿 / 𝗘𝗻𝗰𝗲𝗿𝗿𝗮𝗿** — abra ou finalize o plantão.\n⏸️ **𝗣𝗮𝘂𝘀𝗮𝗿 / 𝗥𝗲𝘁𝗼𝗿𝗻𝗮𝗿** — pause ou continue a contagem.\n👥 **𝗚𝗲𝗿𝗲𝗻𝗰𝗶𝗮𝗿 𝗘𝗾𝘂𝗶𝗽𝗲** — adicione membros normais ou extras.\n📋 **𝗠𝗲𝘂𝘀 𝗣𝗼𝗻𝘁𝗼𝘀** — consulte cartões e horas.')g.settings.panel.description=base.panel.description;
 return g;
}
function timeMinute(t){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw Error('Horário inválido. Use HH:MM.');const [h,m]=t.split(':').map(Number);return h*60+m;}
function localMinutes(timestamp,timeZone){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return Number(p.hour)*60+Number(p.minute);}
function onShift(shift,now=Date.now(),tz='America/Sao_Paulo'){
 const minute=localMinutes(now,tz),start=timeMinute(shift.start),end=timeMinute(shift.end);
 return start===end || (start<end?minute>=start&&minute<end:minute>=start||minute<end);
}
function classify(shiftSettings,shift,roleIds){
 const owned=new Set(roleIds||[]);
 const own=(shiftSettings[shift]?.roleIds||[]).some(id=>owned.has(id));
 if(own)return {type:'normal',originShift:shift};
 return null;
}
function allowedFor(shiftSettings,shift,roleIds,type){const c=classify(shiftSettings,shift,roleIds);return type==='normal'&&c?c:null;}
function list(g){return Object.values(g.cards||{});}
function expire(card,now=Date.now()){
 if(card.status==='pending'&&now>card.expiresAt){card.status='expired';card.history.push({event:'expired',at:now});}
 return card.status==='expired';
}
function busy(g,userId,now=Date.now()){return list(g).find(c=>OPEN.includes(c.status)&&!expire(c,now)&&c.members.some(m=>m.userId===userId&&!m.invalidation))||null;}
// Um convite pendente em outra equipe não pode ocupar a mesma pessoa duas vezes.
function pendingInvitation(g,userId,now=Date.now()){
 return list(g).find(c=>c.status==='active'&&c.joinInvites?.[userId]?.expiresAt>=now)||null;
}
function candidateEligible(g,{shift,type,userId,roleIds,excluded=[]},now=Date.now()){
 return !excluded.includes(userId)&&!busy(g,userId,now)&&!pendingInvitation(g,userId,now)&&
  Boolean(allowedFor(g.settings.shifts,shift,roleIds,type));
}
function createCard(g,{shift,name,leaderId,invitees,now=Date.now()}){
 padGuild(g);const s=g.settings;
 if(!SHIFTS[shift])throw Error('Turno inválido.');name=String(name||'').trim();
 if(name.length<3||name.length>45)throw Error('Nome da equipe deve ter entre 3 e 45 caracteres.');
 if(!Array.isArray(invitees)||ids(invitees).length!==invitees.length||invitees.includes(leaderId))throw Error('Convidados repetidos ou inválidos.');
 if(invitees.length<s.minMembers-1||invitees.length>s.maxMembers-1)throw Error(`Equipe precisa ter entre ${s.minMembers} e ${s.maxMembers} integrantes.`);
 for(const userId of [leaderId,...invitees])if(busy(g,userId,now)||pendingInvitation(g,userId,now))throw Error('Alguém selecionado já está em uma equipe ou tem convite pendente.');
 const id=`BP-${String(g.nextNumber++).padStart(6,'0')}`;
 const members=[leaderId,...invitees].map(userId=>({userId,accepted:userId===leaderId,joinedAt:null,segments:[],type:'normal',originShift:shift,invalidation:null}));
 const card={id,shift,name,leaderId,status:'pending',members,createdAt:now,expiresAt:now+s.inviteMinutes*60000,startedAt:null,endedAt:null,pausedAt:null,
 logChannelId:s.shifts[shift].logChannelId,logMessageId:null,serviceRoleId:s.serviceRoleId,joinInvites:{},history:[{event:'created',at:now,actor:leaderId}]};
 g.cards[id]=card;return card;
}
function createSoloCard(g,{shift,leaderId,now=Date.now()}){
 padGuild(g);if(!SHIFTS[shift])throw Error('Turno inválido.');
 if(busy(g,leaderId,now)||pendingInvitation(g,leaderId,now))throw Error('Você já possui ponto ou convite ativo.');
 const id=`BP-${String(g.nextNumber++).padStart(6,'0')}`;
 const m={userId:leaderId,accepted:true,joinedAt:now,segments:[{start:now,end:null}],type:'normal',originShift:shift,invalidation:null};
 const card={id,shift,name:'Ponto individual',leaderId,status:'active',members:[m],createdAt:now,expiresAt:now,startedAt:now,endedAt:null,pausedAt:null,logChannelId:g.settings.shifts[shift].logChannelId,logMessageId:null,serviceRoleId:g.settings.serviceRoleId,joinInvites:{},history:[{event:'solo_started',at:now,actor:leaderId}]};
 g.cards[id]=card;return card;
}
function respondInvite(card,userId,accepted,now=Date.now()){
 if(expire(card,now)||card.status!=='pending')throw Error('Convite expirado ou indisponível.');
 const member=card.members.find(m=>m.userId===userId&&userId!==card.leaderId);
 if(!member)throw Error('Você não está entre os convidados.');
 if(member.accepted)throw Error('Você já aceitou.');
 if(!accepted){card.status='declined';card.history.push({event:'declined',at:now,actor:userId});return false;}
 member.accepted=true;card.history.push({event:'accepted',at:now,actor:userId});return card.members.every(m=>m.accepted);
}
function launch(card,now=Date.now()){
 if(card.status!=='pending'||card.members.length<2||!card.members.every(m=>m.accepted))throw Error('Todos precisam aceitar antes de iniciar.');
 card.status='active';card.startedAt=now;for(const m of card.members){m.joinedAt=now;m.segments.push({start:now,end:null});}
 card.history.push({event:'started',at:now});return card;
}
function closeOpenSegments(card,now){for(const m of card.members){const segment=m.segments.at(-1);if(segment&&segment.end===null)segment.end=now;}}
function pause(card,actor,now=Date.now()){
 if(card.leaderId!==actor)throw Error('Somente o líder pode pausar.');if(card.status!=='active')throw Error('Cartão não está ativo.');
 closeOpenSegments(card,now);card.status='paused';card.pausedAt=now;card.history.push({event:'paused',at:now,actor});return card;
}
function resume(card,actor,now=Date.now()){
 if(card.leaderId!==actor)throw Error('Somente o líder pode retornar.');if(card.status!=='paused')throw Error('Cartão não está pausado.');
 card.status='active';card.pausedAt=null;for(const m of card.members)if(!m.invalidation)m.segments.push({start:now,end:null});
 card.history.push({event:'resumed',at:now,actor});return card;
}
function finish(card,actor,now=Date.now()){
 if(card.leaderId!==actor)throw Error('Somente o líder pode encerrar.');if(!['active','paused'].includes(card.status))throw Error('Este cartão não está em andamento.');
 closeOpenSegments(card,now);card.status='ended';card.endedAt=now;card.history.push({event:'ended',at:now,actor});return card;
}
function inviteJoin(g,card,userId,actor,classification,now=Date.now()){
 if(card.leaderId!==actor||card.status!=='active')throw Error('Apenas líder de equipe ativa pode convidar.');
 for(const [id,v] of Object.entries(card.joinInvites||{}))if(v.expiresAt<now)delete card.joinInvites[id];
 if(card.members.length+Object.keys(card.joinInvites).length>=g.settings.maxMembers)throw Error('Equipe completa.');
 if(card.members.some(m=>m.userId===userId)||card.joinInvites[userId])throw Error('Usuário já participa ou foi convidado.');
 if(busy(g,userId,now)||pendingInvitation(g,userId,now))throw Error('Usuário já está em outra equipe ou tem convite pendente.');
 if(!classification||classification.type!=='normal'||classification.originShift!==card.shift)throw Error('O integrante precisa ter um cargo de turno autorizado.');
 card.joinInvites[userId]={at:now,expiresAt:now+g.settings.inviteMinutes*60000,type:classification.type,originShift:classification.originShift};
 card.history.push({event:'join_invited',at:now,actor,userId,type:classification.type});return card;
}
function respondJoin(g,card,userId,accepted,now=Date.now()){
 const invite=card.joinInvites?.[userId];if(!invite||now>invite.expiresAt||card.status!=='active')throw Error('Convite indisponível.');
 if(accepted&&busy(g,userId,now))throw Error('Você já participa de outro cartão.');
 if(accepted&&card.members.length>=g.settings.maxMembers)throw Error('Equipe completa.');
 delete card.joinInvites[userId];
 if(accepted)card.members.push({userId,accepted:true,joinedAt:now,segments:[{start:now,end:null}],type:invite.type,originShift:invite.originShift,invalidation:null});
 card.history.push({event:accepted?'joined':'join_declined',at:now,actor:userId,type:invite.type});return card;
}
function recordedFor(member,now=Date.now()){return (member.segments||[]).reduce((total,s)=>total+Math.max(0,(s.end??now)-s.start),0);}
function durationFor(member,now=Date.now()){return member.invalidation?0:recordedFor(member,now);}
function cancelHours(card,users,{actor,reason,now=Date.now()}){
 reason=String(reason||'').trim();if(reason.length<5||reason.length>500)throw Error('Informe motivo de 5 a 500 caracteres.');
 if(!['active','paused','ended'].includes(card.status))throw Error('Cartão não permite cancelamento.');
 const selected=ids(users);if(!selected.length)throw Error('Selecione pelo menos um integrante.');
 for(const userId of selected){const m=card.members.find(x=>x.userId===userId);if(!m)throw Error('Integrante não pertence ao cartão.');if(m.invalidation)throw Error('Horas já canceladas.');}
 const affected=selected.map(userId=>{
  const m=card.members.find(x=>x.userId===userId),ms=recordedFor(m,now),segment=m.segments.at(-1);if(segment&&segment.end===null)segment.end=now;
  m.invalidation={actor,reason,at:now,ms};return {userId,ms,type:m.type||'normal',originShift:m.originShift||card.shift};
 });
 card.history.push({event:'hours_canceled',at:now,actor,reason,affected});
 if(card.members.every(m=>m.invalidation)){closeOpenSegments(card,now);card.status='canceled';card.endedAt??=now;}
 return affected;
}
function totalFor(card,now=Date.now()){
 const totals={normal:0,extra:0};for(const m of card.members)totals.normal+=durationFor(m,now);return totals;
}
// Saldo individual utilizado em Meus Pontos e disponível para a futura integração com o site.
// Nunca credita as horas de um membro a outro; convites só contam depois do aceite.
function hoursForUser(g,userId,now=Date.now()){
 const result={userId,normal:0,extra:0,total:0,cards:0};
 for(const card of list(g)){
  if(['pending','expired','declined'].includes(card.status))continue;
  const m=card.members.find(member=>member.userId===userId);
  if(!m)continue;
  const ms=durationFor(m,now);
  result.normal+=ms;
  result.total+=ms;
  result.cards++;
 }
 return result;
}
function ranking(g,now=Date.now()){
 const result=new Map();for(const card of list(g)){
  if(['pending','expired','declined'].includes(card.status))continue;
  for(const m of card.members){const ms=durationFor(m,now);if(!ms)continue;
   const row=result.get(m.userId)||{userId:m.userId,normal:0,extra:0,total:0};row.normal+=ms;row.total+=ms;result.set(m.userId,row);
  }
 }
 return [...result.values()].sort((a,b)=>b.total-a.total);
}
function format(ms){return `${Math.floor(ms/3600000)}h ${String(Math.floor((ms%3600000)/60000)).padStart(2,'0')}m`;}
module.exports={SHIFTS,OPEN,defaultSettings,defaultGuild,padGuild,timeMinute,localMinutes,onShift,classify,allowedFor,list,busy,pendingInvitation,candidateEligible,expire,createCard,createSoloCard,respondInvite,launch,pause,resume,finish,inviteJoin,respondJoin,recordedFor,durationFor,cancelHours,totalFor,hoursForUser,ranking,format};
