'use strict';
// Um canal de logs por servidor; registros persistentes evitam publicações duplicadas.
const core=require('./core');
const attendance=require('./attendance');
const store=require('./store');
const ui=require('./ui');
const MINUTE=60000,HOUR=3600000;
let running=false;
function windowFor(date,shift,settings){
 const item=settings.shifts[shift],start=core.timeMinute(item.start),end=core.timeMinute(item.end);
 const closeDate=attendance.plusDays(date,end<=start?1:0);
 return {start:attendance.dayStart(date,settings.timezone)+start*MINUTE,
         end:attendance.dayStart(closeDate,settings.timezone)+end*MINUTE};
}
function minutesInShift(g,userId,date,shift){
 const span=windowFor(date,shift,g.settings);let total=0;
 for(const card of core.list(g)){
  if(card.shift!==shift||['pending','declined','expired'].includes(card.status))continue;
  const member=card.members.find(m=>m.userId===userId&&!m.invalidation&&m.type!=='extra');
  if(!member)continue;
  for(const segment of member.segments||[]){
   const a=Math.max(Number(segment.start)||0,span.start),b=Math.min(Number(segment.end??span.end),span.end);
   total+=Math.max(0,b-a);
  }
 }
 return Math.floor(total/MINUTE);
}
function classifyMember(g,userId,date,shift,now){
 const minutes=minutesInShift(g,userId,date,shift);
 if(minutes>=(g.settings.mandatoryMinutes||120))return {status:'presentes',minutes};
 const justification=attendance.sameDayReason(g,userId,date,shift);
 if(justification?.status==='approved')return {status:'justificados',minutes};
 if(justification?.status==='pending')return {status:'pendentes',minutes};
 const fresh=Boolean(g.siteOff?.syncedAt&&now-g.siteOff.syncedAt<10*MINUTE);
 if(attendance.weekday(date)===0||(fresh&&attendance.timeOff(g.siteOff.data,date,shift)))return {status:'folgas',minutes};
 if(minutes>0)return {status:'parciais',minutes};
 return {status:fresh?'faltas':'naoVerificados',minutes};
}
function compileReport(g,date,shift,now=Date.now()){
 const roster=g.attendance.rosters[date]?.shifts?.[shift];
 if(!Array.isArray(roster))return null;
 const groups={presentes:[],parciais:[],faltas:[],justificados:[],pendentes:[],folgas:[],naoVerificados:[]};
 for(const id of [...new Set(roster)]){
  const result=classifyMember(g,id,date,shift,now);
  groups[result.status].push('<@'+id+'>'+(result.minutes?' · '+core.format(result.minutes*MINUTE):''));
 }
 return {date,shift,groups,count:roster.length};
}
function chunks(report){
 const {groups,count,shift,date}=report;
 const sections=[['✅ Presentes','presentes'],['🟡 Presença parcial','parciais'],['❌ Faltas','faltas'],
  ['📝 Justificadas','justificados'],['⏳ Em análise','pendentes'],['🏖️ Folgas','folgas'],
  ['⚠️ Não verificados (folgas sem sincronização)','naoVerificados']];
 const head='**Turno:** '+core.SHIFTS[shift]+'\n**Data:** '+date.split('-').reverse().join('/')+'\n**Escalados:** '+count+'\n';
 const blocks=[];
 for(const [title,key] of sections){
  if(!groups[key].length)continue;
  blocks.push('**'+title+' ('+groups[key].length+')**');
  for(const person of groups[key])blocks.push('• '+person);
 }
 if(!blocks.length)blocks.push('Nenhum integrante registrado na escala.');
 const pages=[];let body=head;
 for(const line of blocks){
  if((body+'\n'+line).length>3100){pages.push(body);body=head;}
  body+='\n'+line;
 }
 pages.push(body);return pages;
}
async function ensureTodayRoster(guild,g,now){
 const today=attendance.localDay(now,g.settings.timezone);
 if(g.attendance.rosters[today])return;
 const members=await guild.members.fetch();
 if(attendance.rosterSnapshot(g,[...members.values()],now))store.save();
}
async function runGuild(guild,now=Date.now()){
 const g=store.get(guild.id),s=g.settings,a=g.attendance;
 if(!s.presenceReportsEnabled||!s.presenceLogChannelId)return {skipped:true};
 if(!a.presenceReportStartedAt){a.presenceReportStartedAt=now;store.save();}
 await ensureTodayRoster(guild,g,now);
 const today=attendance.localDay(now,s.timezone);
 let sent=0;
 for(const date of [attendance.plusDays(today,-1),today])for(const shift of Object.keys(core.SHIFTS)){
  if(!(s.shifts[shift].roleIds||[]).length)continue;
  const key=date+':'+shift,close=windowFor(date,shift,s).end;
  if(a.presenceReports[key]||close>now||now-close>24*HOUR||close<a.presenceReportStartedAt)continue;
  const report=compileReport(g,date,shift,now);
  if(!report){console.warn('[Presença] Escala não capturada: '+guild.id+' '+key);continue;}
  const channel=await guild.channels.fetch(s.presenceLogChannelId);
  if(!channel?.isTextBased()||!channel.send)throw Error('Canal de relatório de presença inacessível');
  const pages=chunks(report),messageIds=[];
  for(let n=0;n<pages.length;n++){
   const title='📋 RELATÓRIO DE PRESENÇA'+(pages.length>1?' ('+(n+1)+'/'+pages.length+')':'');
   const result=await channel.send(ui.v2(title,pages[n],[],false,'purple'));
   messageIds.push(result.id);
  }
  a.presenceReports[key]={at:now,channelId:s.presenceLogChannelId,messageIds};
  for(const old of Object.keys(a.presenceReports))if(old.slice(0,10)<attendance.plusDays(today,-60))delete a.presenceReports[old];
  store.save();sent++;
 }
 return {sent};
}
async function runAll(client,now=Date.now()){
 if(running)return;running=true;
 try{for(const guild of client.guilds.cache.values())try{await runGuild(guild,now)}
  catch(err){console.error('[Presença] '+guild.id+': '+err.message)}}
 finally{running=false}
}
function install(client){
 client.once('clientReady',()=>{
  setTimeout(()=>runAll(client).catch(console.error),15000).unref?.();
  setInterval(()=>runAll(client).catch(console.error),60000).unref?.();
 });
}
module.exports={windowFor,minutesInShift,classifyMember,compileReport,chunks,runGuild,runAll,install};
