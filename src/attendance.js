'use strict';
// Fonte local auditável: resultados são calculados dos segmentos individuais do ponto.
// Sem acesso a datas/cargos passados: só são processados dias com escala capturada pelo bot.
const core = require('./core');
const SHORT = ['dom','seg','ter','qua','qui','sex','sab'];
const formatterCache = new Map();
function localDay(timestamp, timezone='America/Sao_Paulo') {
 let formatter=formatterCache.get(timezone);
 if(!formatter){formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});formatterCache.set(timezone,formatter)}
 const p=Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(x=>[x.type,x.value]));
 return `${p.year}-${p.month}-${p.day}`;
}
function plusDays(date,step){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+step);return d.toISOString().slice(0,10)}
function weekday(date){return new Date(date+'T12:00:00Z').getUTCDay()}
const hours=24*3600000;
const boundaries=new Map();
function dayStart(date,tz){const key=tz+':'+date;if(boundaries.has(key))return boundaries.get(key);
 const approximate=Date.parse(date+'T00:00:00Z');let lo=approximate-36*3600000,hi=approximate+36*3600000;
 // First instant whose local calendar date is >= requested day.
 while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(localDay(mid,tz)<date)lo=mid;else hi=mid;}
 if(boundaries.size>400)boundaries.clear();boundaries.set(key,hi);return hi;
}
function workMs(member,date,tz){if(!member||member.invalidation||member.type==='extra')return 0;
 const start=dayStart(date,tz),end=dayStart(plusDays(date,1),tz);
 return (member.segments||[]).reduce((n,s)=>n+Math.max(0,Math.min(Number(s.end??Date.now()),end)-Math.max(Number(s.start),start)),0);
}
function workedMinutes(g,userId,date,tz){let ms=0;
 for(const card of core.list(g)){if(['pending','declined','expired'].includes(card.status))continue;const m=card.members.find(x=>x.userId===userId);if(m)ms+=workMs(m,date,tz)}
 return Math.floor(ms/60000);
}
function timeOff(off,date,shift){const weekly=off?.weekly||{all:[0]};const d=weekday(date);
 if((weekly.all||[]).includes(d)||(weekly[shift]||[]).includes(d))return true;
 return (off?.dates||[]).some(item=>item.date===date&&(item.shift==='all'||item.shift===shift));
}
function sameDayReason(g,userId,date,shift){return Object.values(g.justifications||{}).find(j=>j.userId===userId&&(j.date===date||j.dates?.includes(date))&&j.shift===shift&&['pending','approved'].includes(j.status));}
function requestedDates(start,days,off=null,shift=null){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isInteger(days)||days<1||days>60)throw Error('Período inválido. Escolha de 1 a 60 dias.');
 const dates=[];let date=start;
 while(dates.length<days){if(weekday(date)!==0&&!(off&&shift&&timeOff(off,date,shift)))dates.push(date);date=plusDays(date,1);}
 return dates;
}
function evaluation(g,{date,shift,userId,off,tz}){
 if(timeOff(off,date,shift))return {status:'folga',minutes:0};
 const justification=sameDayReason(g,userId,date,shift);
 if(justification?.status==='approved')return {status:'justificada',minutes:0};
 if(justification?.status==='pending')return {status:'pendente',minutes:0};
 const minutes=workedMinutes(g,userId,date,tz);
 return {status:minutes>=(g.settings.mandatoryMinutes||120)?'cumpriu':minutes>0?'incompleta':'falta',minutes};
}
function record(g,{date,shift,userId,off,tz},now=Date.now()){
 const key=`${date}:${userId}:${shift}`;
 const ev=evaluation(g,{date,shift,userId,off,tz});
 g.attendance.days[key]={date,shift,userId,...ev,updatedAt:now};
 return ev;
}
// Dias de folga / justificados interrompem a sequência. Dias em análise bloqueiam decisões.
function streakStep(streak,status){if(status==='pendente')return {streak,blocked:true};
 if(status==='falta')return {streak:streak+1,blocked:false};
 if(status==='folga')return {streak:0,blocked:false};
 return {streak:0,blocked:false};
}
function rosterSnapshot(g,members,now=Date.now()){
 const date=localDay(now,g.settings.timezone),current=g.attendance.rosters[date];if(current)return false;
 const shifts={},used=new Set();for(const shift of Object.keys(core.SHIFTS)){const ids=new Set(g.settings.shifts[shift].roleIds);shifts[shift]=members.filter(m=>!m.user.bot&&!used.has(m.id)&&[...m.roles.cache.keys()].some(r=>ids.has(r))).map(m=>{used.add(m.id);return m.id})}
 g.attendance.rosters[date]={date,at:now,shifts};
 // Roster maintained for at most the past 50 days; this is not a historical role export.
 for(const old of Object.keys(g.attendance.rosters))if(old<plusDays(date,-50))delete g.attendance.rosters[old];
 return true;
}
function dayClosed(date,shift,settings,now){const t=settings.shifts[shift],start=core.timeMinute(t.start),end=core.timeMinute(t.end);
 const following=end<=start;const closeDate=plusDays(date,following?1:0);const current=localDay(now,settings.timezone);
 if(current>closeDate)return true;if(current<closeDate)return false;
 return core.localMinutes(now,settings.timezone)>=end;
}
function plan(g,now=Date.now()){
 const a=g.attendance,off=g.siteOff?.data||{weekly:{all:[0]},dates:[]},tz=g.settings.timezone,today=localDay(now,tz);
 const result=[];
 for(const date of Object.keys(a.rosters).sort()){
  if(date>=today)continue;
  for(const shift of Object.keys(core.SHIFTS)){
   if(!dayClosed(date,shift,g.settings,now))continue;
   const roster=a.rosters[date].shifts[shift]||[];
   for(const userId of roster){const key=`${date}:${userId}:${shift}`;if(a.processed[key])continue;
    result.push({date,shift,userId,key,...evaluation(g,{date,shift,userId,off,tz})});
   }
  }
 }
 return result;
}
module.exports={SHORT,localDay,plusDays,weekday,dayStart,requestedDates,workMs,workedMinutes,timeOff,sameDayReason,evaluation,record,streakStep,rosterSnapshot,dayClosed,plan};
