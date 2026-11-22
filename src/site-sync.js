'use strict';
// Sincronização de leitura para o painel, sem modificar a contagem do bot.
const store=require('./store');
const core=require('./core');
const attendance=require('./attendance');
const warningRuntime=require('./attendance-runtime');
const webConfig=require('./web-config');
const panelSync=require('./panel-sync');
const ui=require('./ui');
const keys={manha:'Manhã',tarde:'Tarde',noite:'Noite',madrugada:'Madrugada'};
let running=false;
let scheduled=null;
// Solicitar sincronização antecipada após alterações reais, sem enviar uma consulta por clique.
function requestUpdate(client,delayMs=7000){
 if(!process.env.CENTRAL_API_URL||!process.env.BOT_SYNC_SECRET)return false;
 if(scheduled)return true;
 const delay=Number.isFinite(delayMs)?Math.min(60000,Math.max(1000,delayMs)):7000;
 scheduled=setTimeout(()=>{
  scheduled=null;
  if(running){requestUpdate(client,10000);return;}
  syncAll(client).catch(e=>console.warn('[Central de Horas] Falha na sincronização antecipada:',e.message));
 },delay);
 scheduled.unref?.();
 return true;
}

async function post(data){
 const url=process.env.CENTRAL_API_URL,secret=process.env.BOT_SYNC_SECRET;
 if(!url||!secret)return;
 const res=await fetch(url.replace(/\/$/,'')+'/api/bot-sync',{method:'POST',headers:{'Content-Type':'application/json','X-Bot-Secret':secret},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('HTTP '+res.status+': '+(await res.text()).slice(0,100));
}
function cardsFor(g){
 const now=Date.now();const result=[];
 for(const card of Object.values(g.cards)){
  if(['pending','expired','declined'].includes(card.status))continue;
  for(const m of card.members){
   if(!m.joinedAt)continue;
   const canceled=!!m.invalidation;
   result.push({cardId:card.id+':'+m.userId,userId:m.userId,shift:keys[card.shift],originShift:keys[card.shift],kind:'Normal',status:canceled?'Cancelado':card.status==='ended'?'Validado':'Ativo',startedAt:new Date(m.joinedAt).toISOString(),endedAt:card.endedAt?new Date(card.endedAt).toISOString():null,durationMinutes:canceled?0:Math.floor(core.durationFor(m,now)/60000),cancellationReason:m.invalidation?.reason||null});
  }
 }
 return result;
}
async function pullSiteSettings(guild,g){
 const url=process.env.CENTRAL_API_URL,secret=process.env.BOT_SYNC_SECRET;
 const res=await fetch(url.replace(/\/$/,'')+'/api/bot-config?guildId='+encodeURIComponent(guild.id),{headers:{'X-Bot-Secret':secret},signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('Folgas HTTP '+res.status);
 const reply=await res.json();if(!reply||!reply.timeOff)throw Error('Configuração de folgas ausente');
 g.siteOff={data:reply.timeOff,syncedAt:Date.now()};
 let changed=false;
 if(reply.botConfig){
  const result=webConfig.apply(g,reply.botConfig,reply.configRevision);
  changed=result.changed;
  if(result.applied)store.save();
  // Retentar a confirmação em cada ciclo caso a rede tenha falhado na última.
  if(Number.isInteger(reply.configRevision)&&reply.configRevision>0){
   try{await post({type:'config-ack',guildId:guild.id,revision:reply.configRevision})}
   catch(e){console.warn('[Configuração web] Confirmação pendente:',e.message)}
  }
 }
 if(changed&&g.settings.panel.published?.channelId){
  try{
   const ref=g.settings.panel.published;
   const outcome=await panelSync.synchronizePanel({guild,ref,payload:()=>ui.panel(g.settings.panel,g.settings.pointMode),botUserId:guild.client.user.id,
    fetchChannel:async(guild,id)=>{const channel=await guild.channels.fetch(id);if(!channel||!channel.isTextBased())throw Error('Canal de painel inválido');return channel},save:()=>store.save()});
   console.log('[Configuração web] Painel de ponto:',outcome.state);
  }catch(e){console.warn('[Configuração web] Não foi possível atualizar painel:',e.message)}
 }
 if(changed&&g.settings.justifications.panel?.channelId){
  try{
   const ref=g.settings.justifications.panel;
   const outcome=await panelSync.synchronizePanel({guild,ref,payload:()=>ui.justificationPanel(false,g.settings.justifications.panelVisual),botUserId:guild.client.user.id,
    fetchChannel:async(guild,id)=>{const channel=await guild.channels.fetch(id);if(!channel||!channel.isTextBased())throw Error('Canal de justificativas inválido');return channel},save:()=>store.save()});
   console.log('[Configuração web] Painel de justificativas:',outcome.state);
  }catch(e){console.warn('[Configuração web] Não foi possível atualizar painel de justificativas:',e.message)}
 }
 return reply;
}
async function syncOne(guild){
 const g=store.get(guild.id),shifts=g.settings.shifts;
 const all=await guild.members.fetch();
 const relevant=[...all.values()].filter(m=>!m.user.bot);
 if(attendance.rosterSnapshot(g,relevant))store.save();
 await post({type:'guild',guildId:guild.id,name:guild.name});
 await pullSiteSettings(guild,g);store.save();
 // As configurações do bot são a fonte oficial dos cargos e horários.
 await post({type:'bot-settings',guildId:guild.id,shiftRoles:Object.fromEntries(Object.entries(shifts).map(([k,v])=>[keys[k],v.roleIds])),shiftHours:Object.fromEntries(Object.entries(shifts).map(([k,v])=>[keys[k],[v.start,v.end]])),pointMode:g.settings.pointMode,fullConfig:g.settings});
 for(let i=0;i<relevant.length;i+=50){
  await post({type:'members',guildId:guild.id,members:relevant.slice(i,i+50).map(m=>({userId:m.id,displayName:m.displayName,avatarUrl:m.displayAvatarURL({size:128}),roleIds:[...m.roles.cache.keys()]}))});
 }
 const cards=cardsFor(g);
 for(let i=0;i<cards.length;i+=50)await post({type:'cards',guildId:guild.id,cards:cards.slice(i,i+50)});
 const days=Object.values(g.attendance.days);
 for(let i=0;i<days.length;i+=50)await post({type:'attendance',guildId:guild.id,days:days.slice(i,i+50)});
 const justifications=Object.values(g.justifications);
 for(let i=0;i<justifications.length;i+=50)await post({type:'justifications',guildId:guild.id,justifications:justifications.slice(i,i+50)});
 const warnings=Object.values(g.attendance.warnings);
 for(let i=0;i<warnings.length;i+=50)await post({type:'warnings',guildId:guild.id,warnings:warnings.slice(i,i+50)});
 // O bot nunca calcula autonomamente uma punição. A API do site avalia os
 // registros sincronizados e devolve uma autorização limitada aos dois dias.
 if(g.settings.justifications.autoWarnings){
  const approval=await pullSiteSettings(guild,g);
  const result=await warningRuntime.applySiteApprovals(guild,g,approval.warningApprovals||[]);
  if(result.applied)console.log(`[Central de Horas] ${guild.name}: ${result.applied} advertência(s) autorizada(s) pelo site`);
 }

 console.log(`[Central de Horas] ${guild.name}: ${relevant.length} membros e ${cards.length} registros sincronizados`);
}
async function syncAll(client){
 if(running||!process.env.CENTRAL_API_URL||!process.env.BOT_SYNC_SECRET)return;
 running=true;try{for(const guild of client.guilds.cache.values())try{await syncOne(guild)}catch(e){console.error(`[Central de Horas] ${guild.id}:`,e.message)}}finally{running=false}
}
function install(client){
 client.once('clientReady',()=>{syncAll(client).catch(console.error);const timer=setInterval(()=>syncAll(client).catch(console.error),60000);timer.unref?.()});
 client.on('guildMemberUpdate',()=>{setTimeout(()=>syncAll(client).catch(console.error),2000).unref?.()});
 client.on('guildCreate',()=>{setTimeout(()=>syncAll(client).catch(console.error),2000).unref?.()});
}
async function pushJustification(guildId,justification){
 if(!process.env.CENTRAL_API_URL||!process.env.BOT_SYNC_SECRET)return false;
 await post({type:'justifications',guildId,justifications:[justification]});
 return true;
}
module.exports={install,syncAll,requestUpdate,cardsFor,pushJustification};
