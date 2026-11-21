'use strict';
const core=require('./core');const store=require('./store');const calc=require('./attendance');const ui=require('./ui');
let running=false;
function enabled(g,now=Date.now()){
 const s=g.settings.justifications;
 return s.autoWarnings&&s.warningChannelId&&s.warningRoles.every(Boolean)&&
  g.siteOff?.syncedAt&&now-g.siteOff.syncedAt<10*60000;
}
function setupWarning(g,enabledNow,now=Date.now()){
 g.settings.justifications.autoWarnings=!!enabledNow;
 if(enabledNow){g.attendance.enabledAfterDate=calc.localDay(now,g.settings.timezone);}
}
async function applyWarning(guild,g,item){
 const a=g.attendance,roles=g.settings.justifications.warningRoles;
 const prev=a.warningLevels[item.userId]||0,level=Math.min(3,prev+1);
 // Não aplicar novas punições após a terceira advertência: somente avisar a administração.
 if(prev>=3){
  const entry={type:'Recorrência após terceira advertência',userId:item.userId,shift:item.shift,date:item.date,at:Date.now()};
  g.audit.push(entry);a.streaks[item.userId]=0;store.save();
  try{const ch=await guild.channels.fetch(g.settings.justifications.warningChannelId);
   await ch.send(ui.v2('RECORRÊNCIA DE AUSÊNCIA',
    `**Membro:** <@${item.userId}>\n**Turno:** ${core.SHIFTS[item.shift]}\n**Dia:** ${item.date}\n`+
    '**Advertência atual:** 3 de 3\n\n-# Nenhum cargo novo foi aplicado. Análise manual necessária.',[],false,'amber'));
  }catch(e){console.warn('Aviso de recorrência não publicado:',e.message)}
  return;
 }
 const current=guild.members.cache.get(item.userId)||await guild.members.fetch(item.userId).catch(()=>null);
 if(!current){throw Error('Integrante indisponível para advertência')}
 const roleId=roles[level-1];if(!roleId)throw Error('Cargo de advertência não configurado');
 // First add the next role. Only remove the previous role on success.
 if(!current.roles.cache.has(roleId))await current.roles.add(roleId,`Advertência automática: ausência em ${item.date}`);
 for(const old of roles)if(old&&old!==roleId&&current.roles.cache.has(old))await current.roles.remove(old,'Progressão de advertência');
 // Progredir os níveis sem deixar advertências antigas como ativas no histórico.
 for(const w of Object.values(a.warnings))if(w.userId===item.userId&&w.status==='active'){
  w.status='revoked';w.revokedBy='progressao-automatica';w.revokedAt=Date.now();
 }
 const id=`ADV-${String(a.nextWarning++).padStart(6,'0')}`;
 const warning={id,userId:item.userId,shift:item.shift,date:item.date,level,status:'active',at:Date.now(),reason:'Dois dias consecutivos sem registro de ponto e sem justificativa aprovada',actorId:null,authorization:'site',authorizationId:item.id,evidenceDays:item.evidenceDays};
 a.warnings[id]=warning;a.warningLevels[item.userId]=level;a.streaks[item.userId]=0;store.save();
 try{const ch=await guild.channels.fetch(g.settings.justifications.warningChannelId);await ch.send(ui.warningLog(warning));}catch(e){console.warn('Aviso registrado, mas canal não recebeu:',e.message)}
 try{await current.send({embeds:[ui.warningDM(warning)],allowedMentions:ui.mentions})}catch(e){console.warn('Aviso por DM indisponível:',e.message)}
}
async function runGuild(guild,now=Date.now()){
 const g=store.get(guild.id);
 // Presence tracking is independent of automatic sanctions. Without a fresh leave calendar
 // we stop all classification rather than accidentally treating a day off as absent.
 if(!g.siteOff?.syncedAt||now-g.siteOff.syncedAt>=10*60000)return {skipped:true};
 const items=calc.plan(g,now),processed=[];
 for(const item of items){
  // O bot só consolida a frequência. Advertências dependem de autorização
  // explícita e recente, emitida pela API do site após avaliar os registros.
  if(item.status==='pendente'){
   g.attendance.days[item.key]={date:item.date,shift:item.shift,userId:item.userId,status:item.status,minutes:item.minutes,updatedAt:now};
   store.save();continue;
  }
  g.attendance.days[item.key]={date:item.date,shift:item.shift,userId:item.userId,status:item.status,minutes:item.minutes,updatedAt:now};
  g.attendance.processed[item.key]=true;processed.push(item.key);
  store.save();
 }
 return {processed:processed.length};
}
// Só executa candidatos fornecidos pelo site, verificando novamente os dois dias
// no banco local. Falta de rede, folga ou justificativa pendente bloqueia a ação.
async function applySiteApprovals(guild,g,approvals,now=Date.now()){
 if(!enabled(g,now)||!Array.isArray(approvals))return {applied:0,skipped:true};
 g.attendance.siteApprovalsHandled??={};let applied=0;
 for(const item of approvals.slice(0,100)){
  if(!item||typeof item.id!=='string'||!/^\d{15,25}:(manha|tarde|noite|madrugada):\d{4}-\d{2}-\d{2}$/.test(item.id)||item.id!==`${item.userId}:${item.shift}:${item.date}`)continue;
  if(g.attendance.siteApprovalsHandled[item.id]||g.attendance.warningLevels[item.userId]>=3)continue;
  const dates=item.evidenceDays;
  if(!Array.isArray(dates)||dates.length!==2||calc.plusDays(dates[0],1)!==dates[1]||dates[1]!==item.date)continue;
  if(dates[0]<=g.attendance.enabledAfterDate||dates[1]<=g.attendance.enabledAfterDate)continue;
  if(dates.some(date=>{
   const record=g.attendance.days[`${date}:${item.userId}:${item.shift}`];
   const roster=g.attendance.rosters[date]?.shifts?.[item.shift]||[];
   return record?.status!=='falta'||!roster.includes(item.userId)||
    calc.timeOff(g.siteOff.data,date,item.shift)||
    calc.sameDayReason(g,item.userId,date,item.shift);
  }))continue;
  if(Object.values(g.attendance.warnings).some(w=>w.userId===item.userId&&w.date===item.date))continue;
  try{await applyWarning(guild,g,item);
   g.attendance.siteApprovalsHandled[item.id]=now;store.save();applied++;
  }catch(e){console.error('Falha na advertência autorizada pelo site:',e.message)}
 }
 return {applied};
}
async function runAll(client){if(running)return;running=true;try{for(const guild of client.guilds.cache.values())try{await runGuild(guild)}catch(e){console.error('Presença:',e.message)}}finally{running=false}}
function install(client){client.once('clientReady',()=>{setTimeout(()=>runAll(client).catch(console.error),15000).unref?.();setInterval(()=>runAll(client).catch(console.error),120000).unref?.()})}
async function revoke(guild,g,id,actorId){const w=g.attendance.warnings[id];if(!w||w.status!=='active')throw Error('Advertência não está ativa.');
 const roles=g.settings.justifications.warningRoles;const m=await guild.members.fetch(w.userId);const roleId=roles[w.level-1];
 if(roleId&&m.roles.cache.has(roleId))await m.roles.remove(roleId,`Advertência revisada por ${actorId}`);
 w.status='revoked';w.revokedBy=actorId;w.revokedAt=Date.now();g.attendance.warningLevels[w.userId]=Math.max(0,w.level-1);g.attendance.streaks[w.userId]=0;store.save();return w;
}
module.exports={enabled,setupWarning,runGuild,applySiteApprovals,runAll,install,revoke};
