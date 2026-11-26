'use strict';
require('dotenv').config();
const {
 Client,GatewayIntentBits,Events,PermissionFlagsBits,MessageFlags,ButtonStyle,
 SlashCommandBuilder,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder
}=require('discord.js');
const crypto=require('node:crypto');
const core=require('./core');
const store=require('./store');
const ui=require('./ui');
const siteSync=require('./site-sync');
const attend=require('./attendance');
const {parseDateBR,formatDateBR}=require('./date-br');
const {sendReceiptDM}=require('./receipt-dm');
const attendRuntime=require('./attendance-runtime');
const presenceReports=require('./presence-reports');
const panelSync=require('./panel-sync');
const logSetup=require('./log-setup');
const neroModules=require('./nero-modules');
const meetingV2=require('./meeting-v2');
const welcome=require('./welcome');
const inbox=require('./invite-inbox');
const token=process.env.DISCORD_TOKEN;
if(!token){console.error('❌ Defina DISCORD_TOKEN nas variáveis privadas ou no arquivo .env.');process.exit(1);}
// Para listas de membros realmente filtradas, habilite SERVER MEMBERS INTENT no Developer Portal.
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
const sessions=new Map(),cancellations=new Map(),locks=new Set();
const eph=MessageFlags.Ephemeral;
const command=new SlashCommandBuilder().setName('painelbateponto').setDescription('Publicar a Central de Ponto por equipes e turnos')
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addChannelOption(o=>o.setName('canal').setDescription('Canal para publicar a Central de Ponto').addChannelTypes(ChannelType.GuildText).setRequired(false));
const justCommand=new SlashCommandBuilder().setName('paineljustificativas').setDescription('Publicar painel de justificativas no servidor')
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addChannelOption(o=>o.setName('canal').setDescription('Canal de publicação').addChannelTypes(ChannelType.GuildText).setRequired(false));
const testCommand=new SlashCommandBuilder().setName('testepresenca').setDescription('Simular presença/advertências SEM aplicar cargos ou enviar avisos')
 .addStringOption(o=>o.setName('data').setDescription('Dia para conferir, no formato AAAA-MM-DD').setRequired(false));
const monitorCommand=new SlashCommandBuilder().setName('fiscalizarponto')
 .setDescription('Consultar e fiscalizar cartões de ponto (somente responsáveis)');
const testImageCommand=new SlashCommandBuilder().setName('testarcomprovante')
 .setDescription('Enviar mensagem de comprovante de TESTE no privado (não registra horas)')
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
const commands=[command,justCommand,testCommand,monitorCommand,testImageCommand,...neroModules.commands.filter(c=>c.name!=='painelreuniao'),meetingV2.command,welcome.command];
const db=guild=>store.get(guild.id);
const sid=i=>`${i.guildId}:${i.user.id}`;
const setting=guild=>db(guild).settings;
function sessionFor(i){const s=sessions.get(sid(i));if(!s||Date.now()-s.createdAt>12*60000){sessions.delete(sid(i));return null;}return s;}
async function defer(i){if(i.isMessageComponent()&&i.message.flags.has(eph))await i.deferUpdate();else await i.deferReply({flags:eph});}
async function present(i,payload){
 // Um painel V2 não pode virar uma mensagem legacy com content em uma edição.
 if(payload.content&&i.isMessageComponent()&&i.message.flags.has(MessageFlags.IsComponentsV2))payload=ui.v2('ℹ️ AVISO',payload.content);
 if(i.deferred){const {flags,...rest}=payload;return i.editReply({...rest,...(flags&MessageFlags.IsComponentsV2?{flags:MessageFlags.IsComponentsV2}:{})});}
 if(i.isMessageComponent()&&i.message.flags.has(eph)){const {flags,...rest}=payload;return i.update(rest);}
 return i.reply(payload);
}
const fail=(i,message)=>present(i,ui.msg(`⚠️ ${message}`));
function modal(id,title,fields){const m=new ModalBuilder().setCustomId(id).setTitle(title);
 for(const f of fields){const t=new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style||TextInputStyle.Short).setRequired(f.required!==false).setMaxLength(f.max||500);
  if(f.placeholder)t.setPlaceholder(f.placeholder);
  if(f.value!==undefined&&f.value!==null&&String(f.value))t.setValue(String(f.value).slice(0,f.max||500));m.addComponents(new ActionRowBuilder().addComponents(t));}
 return m;
}
async function member(guild,id){return guild.members.fetch(id);}
async function isAdmin(i,guild=i.guild){return (await member(guild,i.user.id)).permissions.has(PermissionFlagsBits.ManageGuild);}
async function isSupervisor(i,guild,shift){if(await isAdmin(i,guild))return true;const m=await member(guild,i.user.id);
 return setting(guild).shifts[shift].supervisorRoles.some(id=>m.roles.cache.has(id));}
async function hasSupervision(i,guild){if(await isAdmin(i,guild))return true;const m=await member(guild,i.user.id);
 return Object.values(setting(guild).shifts).some(t=>t.supervisorRoles.some(id=>m.roles.cache.has(id)));}
function rolesOf(m){return [...m.roles.cache.keys()];}
async function fetchText(guild,id,label){if(!id)throw Error(`Configure o canal ${label}.`);
 const c=await guild.channels.fetch(id);if(!c?.isTextBased()||!c.send)throw Error(`Canal ${label} inacessível.`);return c;}
async function changeRole(guild,card,userIds,apply){const roleId=card.serviceRoleId;if(!roleId)return;
 const altered=[];try{
  for(const id of [...new Set(userIds)]){
   const m=await member(guild,id);const had=m.roles.cache.has(roleId);
   if(apply&&!had){await m.roles.add(roleId,`Entrada/retorno no ponto ${card.id}`);altered.push({m,had});}
   if(!apply&&had){await m.roles.remove(roleId,`Pausa/saída do ponto ${card.id}`);altered.push({m,had});}
  }
 }catch(e){for(const {m,had} of altered.reverse())try{await (had?m.roles.add(roleId,'Reversão'):m.roles.remove(roleId,'Reversão'));}catch{}throw e;}
}
const activeMembers=c=>c.members.filter(m=>!m.invalidation).map(m=>m.userId);
async function sendClosedReceipts(guild,c){
 const settings=setting(guild);
 if(settings.notifications?.pointDm===false)return;
 for(const m of c.members){
  if(m.invalidation)continue;
  try{
   const guildMember=await guild.members.fetch(m.userId).catch(()=>null);
   const user=guildMember?.user||await client.users.fetch(m.userId);
   const result=await sendReceiptDM({
    user,card:c,member:m,timezone:settings.timezone,notifications:settings.notifications,
    displayName:guildMember?.displayName||user.globalName||user.username||'Membro',
    username:user.username,
    avatarUrls:[guildMember?.displayAvatarURL({extension:'png',size:256,forceStatic:true}),
     user.displayAvatarURL({extension:'png',size:256,forceStatic:true}),user.defaultAvatarURL].filter(Boolean),
    logger:console
   });
   if(result.mode==='dm-blocked')console.warn('[Comprovante] PV indisponível para',m.userId);
  }catch(err){console.warn('Comprovante não enviado para',m.userId,err.message)}
 }
}
// Verificação periódica também funciona se ninguém abrir o painel no Discord.
let runningAutoClose=false;
async function autoCloseAll(){
 if(runningAutoClose)return;runningAutoClose=true;
 try{
  for(const guild of client.guilds.cache.values())for(const c of core.list(db(guild))){
   if(!core.autoCloseDue(c)||locks.has(c.id))continue;
   locks.add(c.id);
   try{
    const now=Date.now();
    if(!core.autoCloseDue(c,now))continue;
    core.finish(c,c.leaderId,now);
    c.history.push({event:'auto_closed',at:now,requiredMinutes:c.requiredMinutes});
    store.save();siteSync.requestUpdate(client);
    await changeRole(guild,c,activeMembers(c),false).catch(e=>console.error('Remover cargo no encerramento automático:',e.message));
    await refreshCard(guild,c);
    await audit(guild,{type:'Encerramento automático',cardId:c.id,shift:c.shift,actorId:c.leaderId,
     reason:'Meta de '+core.format(c.requiredMinutes*60000)+' concluída por todos os participantes válidos.',at:now});
    await sendClosedReceipts(guild,c);
    console.log('[Ponto automático]',guild.id,c.id,'meta',c.requiredMinutes,'minutos');
   }catch(err){console.error('Falha ao finalizar ponto automático:',c.id,err.message)}
   finally{locks.delete(c.id);}
  }
 }finally{runningAutoClose=false;}
}
async function refreshCard(guild,card){try{if(!card.logChannelId||!card.logMessageId)return;
 const ch=await fetchText(guild,card.logChannelId,'de logs');const msg=await ch.messages.fetch(card.logMessageId);await msg.edit(ui.logCard(card));
 }catch(e){console.error(`Atualização do cartão ${card.id}:`,e.message);}}
async function audit(guild,entry){
 const g=db(guild);g.audit.push(entry);store.save();
 const card=g.cards[entry.cardId],payload=ui.auditLog(entry,card,guild.id);
 let published=false;
 if(g.settings.auditChannelId)try{
  const ch=await fetchText(guild,g.settings.auditChannelId,'de auditoria');
  await ch.send(payload);published=true;
 }catch(e){console.error('Auditoria salva, mas não publicada:',e.message);}
 const eventTypes=new Set(['Início individual','Entrada da equipe','Pausa','Retorno','Encerramento','Encerramento automático','Cancelamento de horas']);
 if(eventTypes.has(entry.type)){
  const channelId=entry.type==='Cancelamento de horas'?g.settings.cancelLogChannelId:g.settings.pointEventsChannelId;
  if(channelId&&channelId!==g.settings.auditChannelId)try{
   const channel=await fetchText(guild,channelId,'do bate-ponto');
   await channel.send(payload);
  }catch(e){console.error('Log do ponto salvo, mas não publicado:',e.message);}
 }
 return published;
}
async function refreshPublished(guild, ref, makePayload, label) {
 if (!ref?.channelId) return false;
 try {
  const result = await panelSync.synchronizePanel({
   guild, ref, payload: makePayload, botUserId: client.user.id,
   fetchChannel: (g, id) => fetchText(g, id, `do painel de ${label}`),
   save: () => store.save()
  });
  console.log(`[Painel ${label}] ${guild.name}: ${result.state}`);
  if (result.state === 'replaced-foreign') console.warn(`[Painel ${label}] Mensagem antiga de outro aplicativo não pode ser editada; uma nova foi publicada no canal salvo.`);
  return result.state !== 'unregistered';
 } catch (err) {
  console.error(`[Painel ${label}] ${guild.name}: não foi possível sincronizar automaticamente: ${err.message}`);
  return false;
 }
}
async function refreshPanel(guild) {
 const s = setting(guild);
 return refreshPublished(guild, s.panel.published, () => ui.panel(s.panel, s.pointMode), 'bate-ponto');
}
async function refreshJustificationPanel(guild) {
 const s = setting(guild);
 return refreshPublished(guild, s.justifications.panel, () => ui.justificationPanel(false,s.justifications.panelVisual), 'justificativas');
}
async function refreshAllPanels(guild) {
 await refreshPanel(guild);
 await refreshJustificationPanel(guild);
}
function ownOpen(guild,userId){return core.list(db(guild)).find(c=>core.OPEN.includes(c.status)&&c.members.some(m=>m.userId===userId&&!m.invalidation))||null;}
function leadOpen(guild,userId){return core.list(db(guild)).find(c=>core.OPEN.includes(c.status)&&c.leaderId===userId)||null;}
async function eligibleShifts(guild,id){const s=setting(guild),m=await member(guild,id),roles=rolesOf(m);
 return Object.keys(core.SHIFTS).filter(k=>core.onShift(s.shifts[k],Date.now(),s.timezone)&&(s.shifts[k].roleIds||[]).some(r=>roles.includes(r)));
}
async function fetchEligible(guild,shift,type,exclude=[]){
 // Buscar todos os membros, não apenas os que já estão no cache.
 let collection;
 try{collection=await guild.members.fetch();}catch(e){throw Error('Não foi possível listar os membros. Habilite SERVER MEMBERS INTENT no Discord Developer Portal e reinicie o bot.');}
 const s=setting(guild),blocked=new Set(exclude),g=db(guild);
 const candidates=[],diagnostics={total:0,otherShift:0,busy:0,pending:0,excluded:0};
 for(const m of collection.values()){
  if(m.user.bot)continue;
  diagnostics.total++;
  const classification=core.classify(s.shifts,shift,rolesOf(m));
  if(!classification||classification.type!==type)continue;
  diagnostics.otherShift++;
  if(blocked.has(m.id)){diagnostics.excluded++;continue;}
  if(core.busy(g,m.id)){diagnostics.busy++;continue;}
  if(core.pendingInvitation(g,m.id)){diagnostics.pending++;continue;}
  candidates.push({id:m.id,label:(m.displayName||m.user.username).slice(0,90),desc:'Integrante do turno selecionado'});
 }
 candidates.sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
 return {candidates,diagnostics};
}
async function startCandidateSession(i,{kind,shift,type,cardId=null,draft=null}){
 await defer(i);const guild=i.guild;
 const exclude=[i.user.id];const card=cardId?db(guild).cards[cardId]:null;
 if(card){exclude.push(...card.members.map(m=>m.userId),...Object.keys(card.joinInvites||{}));}
 const {candidates,diagnostics}=await fetchEligible(guild,shift,type,exclude);
 const session={kind,shift,type,cardId,key:crypto.randomBytes(4).toString('hex'),createdAt:Date.now(),page:0,selected:[],candidates,diagnostics,draft,search:''};
 sessions.set(sid(i),session);return present(i,ui.candidateView(session));
}
async function showCandidates(i,session){
 const card=session.cardId?db(i.guild).cards[session.cardId]:null;
 const excluded=[i.user.id,...(card?.members||[]).map(m=>m.userId),...Object.keys(card?.joinInvites||{})];
 const result=await fetchEligible(i.guild,session.shift,session.type,excluded);
 session.diagnostics=result.diagnostics;
 session.candidates=result.candidates.filter(m=>!session.search||m.label.toLocaleLowerCase('pt-BR').includes(session.search.toLocaleLowerCase('pt-BR')));
 session.selected=session.selected.filter(id=>result.candidates.some(m=>m.id===id));
 session.page=Math.max(0,Math.min(session.page,Math.ceil(session.candidates.length/25)-1));
 return present(i,ui.candidateView(session));
}
async function startSolo(i,shift){
 const guild=i.guild,g=db(guild),s=g.settings;
 if(s.pointMode!=='individual')return fail(i,'O modo individual está desligado.');
 if(!(await eligibleShifts(guild,i.user.id)).includes(shift))return fail(i,'Este turno não está disponível para seu cargo.');
 if(ownOpen(guild,i.user.id))return fail(i,'Você já está em serviço.');
 if(!s.serviceRoleId||!s.shifts[shift].logChannelId)return fail(i,'Configure cargo em serviço e logs do turno antes.');
 await defer(i);
 const c=core.createSoloCard(g,{shift,leaderId:i.user.id});
 try{
  await changeRole(guild,c,[i.user.id],true);
  const ch=await fetchText(guild,c.logChannelId,'de logs');const post=await ch.send(ui.logCard(c));c.logMessageId=post.id;store.save();siteSync.requestUpdate(client);
  await audit(guild,{type:'Início individual',cardId:c.id,shift,actorId:i.user.id,at:Date.now()});
  return present(i,ui.msg(`✅ Ponto individual iniciado. Cartão ${c.id}. Abra Meu ponto para acompanhar.`));
 }catch(e){delete g.cards[c.id];store.save();await changeRole(guild,c,[i.user.id],false).catch(()=>{});throw e;}
}
async function showInvites(i){
 const invites=inbox.pending(db(i.guild),i.user.id).filter(x=>x.type!=='extra'),limit=4;
 if(!invites.length)return present(i,ui.v2('📨 MEUS CONVITES',
  'Você não possui convites pendentes neste servidor. Quando alguém convidar você para uma equipe, volte aqui para aceitar ou recusar. Não é necessário abrir o PV.'));
 const body=invites.slice(0,limit).map((entry,n)=>{
  const c=entry.card;
  return `**${n+1}. Equipe ${ui.safe(c.name)}** · ${c.id}\n`+
   `**Turno:** ${core.SHIFTS[c.shift]} · **Líder:** <@${c.leaderId}>\n`+
   `**Modalidade:** Horas do turno\n`+
   `**Validade:** <t:${Math.floor(entry.expiresAt/1000)}:R>`;
 }).join('\n\n')+(invites.length>limit?`\n\nHá mais ${invites.length-limit} convite(s); volte aqui após responder aos primeiros.`:'');
 const controls=invites.slice(0,limit).map(entry=>{
  const kind=entry.kind==='join'?'dj':'dm',base=`${kind}:`;
  return ui.row(
   ui.button(`${base}yes:${i.guildId}:${entry.card.id}`,'Aceitar · '+entry.card.id,ButtonStyle.Success,'✅'),
   ui.button(`${base}no:${i.guildId}:${entry.card.id}`,'Recusar',ButtonStyle.Danger,'❌')
  );
 });
 controls.push(ui.row(ui.button('bp:invites','Atualizar convites',ButtonStyle.Secondary,'🔄')));
 return present(i,ui.v2('📨 MEUS CONVITES','Somente você pode ver e responder a estes convites.\n\n'+body,controls));
}
async function showMine(i){
 const g=db(i.guild),card=core.list(g).find(c=>['active','paused'].includes(c.status)&&c.members.some(m=>m.userId===i.user.id&&!m.invalidation));
 if(!card)return present(i,ui.v2('MEU PONTO','Você não possui ponto ativo no momento. Para consultar os registros anteriores, acesse o histórico da Central de Horas.'));
 const m=card.members.find(x=>x.userId===i.user.id),paused=card.history.filter(h=>h.event==='paused').length;
 const body=`**Cartão:** ${card.id}\n**Equipe:** ${ui.safe(card.name)}\n**Turno:** ${core.SHIFTS[card.shift]}\n`+
 `**Situação:** ${ui.stat[card.status]}\n**Início:** <t:${Math.floor(m.joinedAt/1000)}:f>\n`+
 `**Tempo válido:** ${core.format(core.durationFor(m))}\n**Pausas registradas:** ${paused}\n`+
 `**Modalidade:** Horas registradas`;
 const controls=card.leaderId===i.user.id&&['active','paused'].includes(card.status)?[
  ui.row(ui.button('bp:pause',card.status==='active'?'Pausar':'Retomar',ButtonStyle.Secondary),ui.button(`act:end:${card.id}`,'Encerrar',ButtonStyle.Danger))]:[];
 return present(i,ui.v2('MEU PONTO ATIVO',body,controls));
}
async function showMonitor(i){if(!(await hasSupervision(i,i.guild)))return fail(i,'Acesso restrito a responsáveis de turno.');
 const guild=i.guild,m=await member(guild,i.user.id),admin=await isAdmin(i);
 const cards=core.list(db(guild)).filter(c=>admin||setting(guild).shifts[c.shift].supervisorRoles.some(id=>m.roles.cache.has(id))).reverse().slice(0,25);
 const options=cards.map(c=>({label:`${c.id} • ${c.name}`.slice(0,100),value:c.id,description:`${core.SHIFTS[c.shift]} • ${c.status}`}));
 return present(i,ui.v2('🔎 CARTÕES SOB FISCALIZAÇÃO',cards.length?'Selecione um cartão ativo ou encerrado para consultar ou cancelar horas.':'Nenhum cartão disponível.',options.length?[ui.select('monitor:pick',options,'Escolha um cartão')]:[]));
}
async function showCancel(i,c){if(!(await isSupervisor(i,i.guild,c.shift)))return fail(i,'Você não é responsável por este turno.');
 if(!setting(i.guild).auditChannelId)return fail(i,'Configure antes o canal de auditoria geral.');
 const available=c.members.filter(m=>!m.invalidation);
 if(!available.length||!['active','paused','ended'].includes(c.status))return fail(i,'Não há horas válidas para cancelar neste cartão.');
 const options=available.map(m=>({label:`${m.type==='extra'?'⏱️':'👤'} ${m.userId}`.slice(0,100),value:m.userId,description:`${core.format(core.durationFor(m))} válidas`}));
 return present(i,ui.v2('❌ CANCELAR HORAS',`**Cartão:** ${c.id}\n**Turno:** ${core.SHIFTS[c.shift]}\nSelecione um ou vários integrantes. O motivo será obrigatório e ficará na auditoria.`,[ui.select(`cancelpick:${c.id}`,options,'Selecione quem perderá as horas',options.length)]));
}
async function onButton(i){const [prefix,verb,arg]=i.customId.split(':');const guild=i.guild,g=db(guild),s=g.settings;
 if(prefix==='bp'){
  if(verb==='toggle'){
   const c=leadOpen(guild,i.user.id);
   if(c?.status==='pending')return present(i,ui.v2('⌛ CONVITES PENDENTES',`Equipe **${ui.safe(c.name)}** está aguardando aceites. Se desejar, cancele a solicitação sem registrar horas.`,[ui.row(ui.button(`act:abort:${c.id}`,'Cancelar convite',ButtonStyle.Danger,'❌'))]));
   if(c&&['active','paused'].includes(c.status))return present(i,ui.v2('🔴 ENCERRAR PONTO',`**Equipe:** ${ui.safe(c.name)}\n**Cartão:** ${c.id}\nDeseja encerrar o ponto da equipe?`,[ui.row(ui.button(`act:end:${c.id}`,'Confirmar encerramento',ButtonStyle.Danger,'🔴'))]));
   const other=ownOpen(guild,i.user.id);if(other)return fail(i,'Você participa de um cartão aberto. Somente o líder pode encerrar.');
   const eligible=await eligibleShifts(guild,i.user.id);if(!eligible.length)return fail(i,'Não existe turno aberto para seu cargo neste momento.');
   const ready=eligible.filter(k=>s.shifts[k].logChannelId&&s.serviceRoleId);
   if(!ready.length)return fail(i,'Configure antes o canal de logs do seu turno e o cargo Em serviço.');
   if(ready.length===1&&s.pointMode==='individual')return startSolo(i,ready[0]);
   if(ready.length===1)return i.showModal(modal(`start:${ready[0]}`,'Criar equipe',[{id:'team',label:'Nome da equipe (3 a 45 letras)',max:45}]));
   return present(i,ui.v2('🕒 SEU TURNO','Você possui mais de um cargo de turno ativo. Escolha o turno do cartão.',[ui.select('begin:shift',ready.map(k=>({label:core.SHIFTS[k],value:k})))]));
  }
  if(verb==='pause'){
   const c=leadOpen(guild,i.user.id);if(!c||!['active','paused'].includes(c.status))return fail(i,'Somente o líder de um ponto em andamento pode pausar ou retornar.');
   const action=c.status==='active'?'pause':'resume';
   return present(i,ui.v2('⏸️ PAUSAR / ▶️ RETORNAR',`**Equipe:** ${ui.safe(c.name)}\n**Status atual:** ${ui.stat[c.status]}`, [ui.row(ui.button(`act:${action}:${c.id}`,action==='pause'?'Confirmar pausa':'Confirmar retorno',ButtonStyle.Primary,action==='pause'?'⏸️':'▶️'))]));
  }
  if(verb==='team'){
   if(s.pointMode!=='team')return fail(i,'O modo Equipe está desativado nas configurações.');
   const c=leadOpen(guild,i.user.id)||ownOpen(guild,i.user.id);
   if(!c)return fail(i,'Você precisa estar em uma equipe para gerenciá-la. Para montar uma equipe, clique em Iniciar.');
   if(c.leaderId!==i.user.id)return present(i,ui.v2('👥 MINHA EQUIPE',ui.cardText(c)));
   if(c.status!=='active')return fail(i,'A equipe precisa estar ativa para adicionar integrantes.');
   return present(i,ui.teamMenu(c));
  }
  if(verb==='invites')return showInvites(i);
  if(verb==='mine')return showMine(i);
  if(verb==='justify')return present(i,ui.justificationPanel(true,s.justifications.panelVisual));
  if(verb==='ranking')return present(i,ui.v2('🏆 RANKING POR HORAS',core.ranking(g).slice(0,15).map((r,n)=>`${n+1}. <@${r.userId}> — ${core.format(r.total)} de serviço`).join('\n')||'Ainda não há horas.'));
  if(verb==='monitor')return showMonitor(i);
  if(verb==='config')return await isAdmin(i)?present(i,ui.config(s)):fail(i,'Somente administradores com Gerenciar Servidor podem configurar.');
 }
 if(prefix==='act'){
  const c=g.cards[arg];if(!c||c.leaderId!==i.user.id)return fail(i,'Somente o líder pode realizar esta ação.');
  if(locks.has(c.id))return fail(i,'Este ponto está sendo atualizado.');await defer(i);locks.add(c.id);
  try{
   if(verb==='abort'){if(c.status!=='pending')throw Error('Convite já foi encerrado.');c.status='declined';c.history.push({event:'leader_cancel_pending',at:Date.now(),actor:i.user.id});}
   else if(verb==='pause'){if(c.status!=='active')throw Error('Ponto não está ativo.');await changeRole(guild,c,activeMembers(c),false);core.pause(c,i.user.id);}
   else if(verb==='resume'){if(c.status!=='paused')throw Error('Ponto não está pausado.');await changeRole(guild,c,activeMembers(c),true);core.resume(c,i.user.id);}
   else if(verb==='end'){if(!['active','paused'].includes(c.status))throw Error('Ponto não está em andamento.');await changeRole(guild,c,activeMembers(c),false);core.finish(c,i.user.id);}
   else throw Error('Ação desconhecida.');
   store.save();siteSync.requestUpdate(client);await refreshCard(guild,c);await audit(guild,{type:{abort:'Cancelamento de convite',pause:'Pausa',resume:'Retorno',end:'Encerramento'}[verb],cardId:c.id,shift:c.shift,actorId:i.user.id,at:Date.now()});
   if(verb==='end')await sendClosedReceipts(guild,c);
   return present(i,ui.v2('✅ OPERAÇÃO CONCLUÍDA',ui.cardText(c)));
  }finally{locks.delete(c.id);}
 }
 if(prefix==='team'){
  if(s.pointMode!=='team')return fail(i,'O modo Equipe não está habilitado.');
  const c=g.cards[arg];if(!c||c.leaderId!==i.user.id||c.status!=='active')return fail(i,'Somente o líder de equipe ativa pode convidar.');
  if(verb==='members')return present(i,ui.v2('👥 INTEGRANTES',ui.cardText(c)));
  if(verb!=='normal')return fail(i,'Convite indisponível. Somente integrantes do próprio turno podem entrar.');
  if(c.members.length+Object.keys(c.joinInvites||{}).length>=s.maxMembers)return fail(i,'Equipe completa.');
  return startCandidateSession(i,{kind:'add',shift:c.shift,type:verb,cardId:c.id});
 }
 if(prefix==='page'){
  const session=sessionFor(i);if(!session)return fail(i,'Menu expirado. Abra Gerenciar equipe novamente.');
  const max=Math.max(0,Math.ceil(session.candidates.length/25)-1);session.page=Math.max(0,Math.min(max,session.page+(verb==='next'?1:-1)));
  return showCandidates(i,session);
 }
 if(prefix==='cand'){
  if(verb==='exit'){sessions.delete(sid(i));return present(i,ui.v2('SELEÇÃO ENCERRADA','Você pode abrir o painel novamente para iniciar um novo convite.'));}
  const ses=sessionFor(i);if(!ses)return fail(i,'Seleção expirada. Abra o menu novamente.');
  if(verb==='search')return i.showModal(modal('cand:query','Buscar integrante',[{id:'query',label:'Nome ou parte do nome',max:80,required:false}]));
  if(verb==='reload')return showCandidates(i,ses);
 }
 if(prefix==='just'&&verb==='config'){
  if(!(await isAdmin(i)))return fail(i,'Somente a administração pode configurar as justificativas e advertências.');
  return present(i,ui.justificationConfig(s));
 }
 if(prefix==='just'&&verb==='home')return present(i,ui.justificationPanel(true,s.justifications.panelVisual));
 if(prefix==='just'&&verb==='open'){
  return i.showModal(modal('just:submit','Justificar ausência',[{id:'day',label:'Início (DD/MM/AAAA)',placeholder:'23/11/2026',max:10},{id:'days',label:'Dias de serviço (1 a 60)',placeholder:'3',max:2},{id:'reason',label:'Motivo (não inclua dados sensíveis)',style:TextInputStyle.Paragraph,max:500}]));
 }
 if(prefix==='justify'){
  if(!['approve','reject'].includes(verb))return fail(i,'Ação inválida.');
  const j=g.justifications[arg];if(!j||j.status!=='pending')return fail(i,'Justificativa já analisada ou inexistente.');
  if(!(await isSupervisor(i,guild,j.shift)))return fail(i,'Somente responsáveis podem analisar justificativas.');
  await defer(i);
  j.status=verb==='approve'?'approved':'rejected';j.reviewerId=i.user.id;j.decidedAt=Date.now();store.save();
  const dest=await client.users.fetch(j.userId).catch(()=>null);if(dest)await dest.send({embeds:[ui.justificationDM(j)],allowedMentions:ui.mentions}).catch(()=>{});
  if(i.message)await i.message.edit(ui.v2('JUSTIFICATIVA ANALISADA',`**Protocolo:** ${j.id}\n**Membro:** <@${j.userId}>\n**Dias:** ${(j.dates||[j.date]).map(formatDateBR).join(', ')}\n**Situação:** ${j.status==='approved'?'Aprovada':'Recusada'}\n**Responsável:** <@${i.user.id}>`,[],false));
  const logId=s.justifications.logChannelId||s.justifications.reviewChannelId;
  if(logId)try{const logCh=await fetchText(guild,logId,'de justificativas');await logCh.send(ui.justificationDecisionLog(j))}
   catch(err){console.warn('Não foi possível publicar o log de justificativa:',err.message)}
  let synced=false;
  try{synced=await siteSync.pushJustification(guild.id,j)}catch(err){console.warn('Justificativa salva no bot; site será atualizado na próxima sincronização:',err.message)}
  return present(i,ui.msg(synced?'Decisão registrada no bot e sincronizada com o site.':'Decisão salva no bot. A sincronização com o site será repetida automaticamente.'));
 }
 if(prefix==='warn'&&verb==='revoke'){
  if(!(await isAdmin(i)))return fail(i,'Somente administradores podem revogar advertências.');
  await defer(i);const w=await attendRuntime.revoke(guild,g,arg,i.user.id);
  if(i.message)await i.message.edit(ui.warningLog(w));
  return present(i,ui.msg('✅ Advertência revogada e cargo atualizado.'));
 }
 if(prefix==='draft'){
  const session=sessionFor(i);if(!session||session.kind!=='draft')return fail(i,'Montagem expirada. Reinicie pelo painel.');
  if(verb==='clear'){session.selected=[];return present(i,ui.candidateView(session));}
  if(verb!=='send')return fail(i,'Opção inválida.');
  if(session.selected.length<s.minMembers-1||session.selected.length>s.maxMembers-1)return fail(i,`Escolha ${s.minMembers-1} a ${s.maxMembers-1} integrantes.`);
  if(!core.onShift(s.shifts[session.shift],Date.now(),s.timezone))return fail(i,'O horário do turno terminou.');
  const lead=await member(guild,i.user.id);
  if(!core.allowedFor(s.shifts,session.shift,rolesOf(lead),'normal'))return fail(i,'Você perdeu o cargo necessário para iniciar.');
  for(const id of session.selected){const m=await member(guild,id);if(!core.allowedFor(s.shifts,session.shift,rolesOf(m),'normal'))return fail(i,'Um convidado perdeu o cargo do turno. Atualize a lista.');}
  await defer(i);const c=core.createCard(g,{shift:session.shift,name:session.draft.name,leaderId:i.user.id,invitees:session.selected});
  try{
   const log=await fetchText(guild,c.logChannelId,'de logs do turno');const card=await log.send(ui.logCard(c));c.logMessageId=card.id;store.save();
   const failed=[];for(const id of session.selected){try{const user=await client.users.fetch(id);await user.send(ui.inviteDM(c,guild.id,id,'initial'));}catch{failed.push(id);}}
   if(failed.length){c.history.push({event:'dm_unavailable',at:Date.now(),failed});store.save();}
   sessions.delete(sid(i));
   return present(i,ui.msg(`📨 Cartão ${c.id} criado. Os integrantes podem aceitar pelo botão **Meus convites** no painel do servidor.${failed.length?`\n⚠️ PV indisponível para ${failed.map(id=>`<@${id}>`).join(', ')}; o convite continua válido no servidor.`:''} A contagem começa quando todos aceitarem.`));
  }catch(e){delete g.cards[c.id];store.save();throw e;}
 }
 if(prefix==='cfg'){
  if(!(await isAdmin(i)))return fail(i,'Configuração restrita à administração.');
  if(verb==='mandatory')return present(i,ui.mandatoryConfig(s));
  if(verb==='mandatory-edit')return i.showModal(modal('mod:mandatory:all','Horas obrigatórias globais',[
   {id:'hours',label:'Horas obrigatórias (1 a 12)',value:String(s.mandatoryMinutes/60),max:2}]));
  if(verb==='logs')return present(i,ui.logsConfig(s));
  if(verb==='logs-create'){
   const key='setup-logs:'+guild.id;
   if(locks.has(key))return fail(i,'A criação de logs já está em andamento.');
   locks.add(key);await defer(i);
   try{
    const result=await logSetup.createLogs(guild,s);
    g.logsProvisionedRevision=Number.isInteger(g.siteConfigRevision)?g.siteConfigRevision:0;
    store.save();siteSync.requestUpdate(client);
    return present(i,ui.logsConfig(s,'✅ Logs prontos: '+result.created.length+' criados e '+result.reused.length+' reaproveitados.'));
   }finally{locks.delete(key);}
  }
  if(verb==='shifts')return present(i,ui.v2('TURNOS E CARGOS','Selecione um turno. Os cargos originais e a separação de membros permanecem preservados.',[
   ui.row(...Object.entries(core.SHIFTS).map(([k,label])=>ui.button(`cfg:turn:${k}`,label,ButtonStyle.Secondary))),
   ui.row(ui.button('bp:config','Voltar às configurações',ButtonStyle.Secondary))]));
  if(verb==='turn')return present(i,ui.shiftConfig(s,arg));
  if(verb==='hours'){const t=s.shifts[arg];if(!t)return fail(i,'Turno inválido.');return i.showModal(modal(`mod:hours:${arg}`,`Horário • ${arg}`,[{id:'start',label:'Início HH:MM',value:t.start,max:5},{id:'end',label:'Fim HH:MM',value:t.end,max:5}]));}
  if(verb==='roles')return present(i,ui.v2('🎭 CARGOS DO TURNO',`Selecione até cinco cargos válidos para ${core.SHIFTS[arg]}. Só membros com esses cargos serão listados para o turno.`,[ui.roleSelect(`save:roles:${arg}`,5),ui.row(ui.button(`cfg:turn:${arg}`,'Voltar',ButtonStyle.Secondary))]));
  if(verb==='super')return present(i,ui.v2('👑 RESPONSÁVEIS DO TURNO',`Esses cargos poderão fiscalizar e cancelar horas **somente** do ${core.SHIFTS[arg]}.`,[ui.roleSelect(`save:super:${arg}`,5),ui.row(ui.button(`cfg:turn:${arg}`,'Voltar',ButtonStyle.Secondary))]));
  if(verb==='log')return present(i,ui.v2('📁 CANAL DE LOGS',`Selecione o canal que receberá os cartões do ${core.SHIFTS[arg]}, incluindo os finalizados.`,[ui.channelSelect(`save:log:${arg}`),ui.row(ui.button(`cfg:turn:${arg}`,'Voltar',ButtonStyle.Secondary))]));
  if(verb==='service')return present(i,ui.v2('🏷️ CARGO EM SERVIÇO','O bot entrega ao iniciar e remove ao pausar, cancelar ou encerrar.',[ui.roleSelect('save:service:all'),ui.row(ui.button('bp:config','Voltar',ButtonStyle.Secondary))]));
  if(verb==='audit')return present(i,ui.v2('🛡️ AUDITORIA GERAL','Canal separado para registrar quem cancelou, de quem, quantas horas e o motivo.',[ui.channelSelect('save:audit:all'),ui.row(ui.button('bp:config','Voltar',ButtonStyle.Secondary))]));
  if(verb==='rules')return i.showModal(modal('mod:rules:all','Equipes e convites',[
   {id:'min',label:'Mínimo de pessoas (2–4)',value:s.minMembers,max:1},{id:'max',label:'Máximo de pessoas (2–4)',value:s.maxMembers,max:1},
   {id:'minutes',label:'Convites (5–60 minutos)',value:s.inviteMinutes,max:2},{id:'timezone',label:'Fuso horário (IANA)',value:s.timezone,max:80}]));
  if(verb==='visual')return i.showModal(modal('mod:visual:all','Visual do painel',[
   {id:'title',label:'Título',value:s.panel.title,max:90},{id:'description',label:'Descrição do painel',value:s.panel.description,max:600,style:TextInputStyle.Paragraph},
   {id:'gif',label:'Link GIF HTTPS (ou "padrao")',value:s.panel.customGif||'',max:300,required:false}]));
  if(verb==='monitor')return showMonitor(i);
  if(verb==='mode')return present(i,ui.modeConfig(s));
   if(verb==='presence')return present(i,ui.presenceConfig(s));
   if(verb==='presence-channel')return present(i,ui.v2('📋 CANAL DE PRESENÇA','Escolha um único canal para receber os relatórios automáticos de todos os turnos.',[ui.channelSelect('save:presence:all'),ui.row(ui.button('cfg:presence','Voltar',ButtonStyle.Secondary))]));
   if(verb==='presence-toggle'){s.presenceReportsEnabled=!s.presenceReportsEnabled;if(s.presenceReportsEnabled)g.attendance.presenceReportStartedAt=Date.now();store.save();siteSync.requestUpdate(client);return present(i,ui.presenceConfig(s));}
  if(verb==='mode-team'||verb==='mode-individual'){
   s.pointMode=verb==='mode-individual'?'individual':'team';store.save();siteSync.requestUpdate(client);await refreshPanel(guild);return present(i,ui.modeConfig(s));
  }
  if(verb==='just')return present(i,ui.justificationConfig(s));
  if(verb==='just-roles')return present(i,ui.justificationRolesConfig(s));
  if(verb==='notify')return present(i,ui.notificationsConfig(s));
  if(verb==='notify-dm'){
   s.notifications.pointDm=!s.notifications.pointDm;
   s.notifications.receiptImage=false;store.save();return present(i,ui.notificationsConfig(s));
  }
  if(verb==='notify-image'){ // Compatibilidade com botões antigos no Discord.
   s.notifications.receiptImage=false;store.save();return present(i,ui.notificationsConfig(s));
  }
  if(['just-review','just-log','just-warning'].includes(verb))return present(i,ui.v2('CANAIS DE JUSTIFICATIVAS',
   verb==='just-review'?'Onde os pedidos chegam para aprovação ou recusa.':verb==='just-log'?'Onde publicar cada aprovação ou recusa. Se não configurar, usa o canal de análise.':'Onde publicar as advertências automáticas.',
   [ui.channelSelect('save:'+verb+':all'),ui.row(ui.button('cfg:just','Voltar',ButtonStyle.Secondary))]));
  if(/^just-role-[123]$/.test(verb))return present(i,ui.v2('CARGO DE ADVERTÊNCIA',`Escolha o cargo para o nível ${verb.slice(-1)}.`,[
   ui.roleSelect('save:'+verb+':all'),ui.row(ui.button('cfg:just-roles','Voltar às advertências',ButtonStyle.Secondary))]));
  if(verb==='just-toggle'){
   if(!s.justifications.autoWarnings){
    if(!s.justifications.reviewChannelId||!s.justifications.warningChannelId||s.justifications.warningRoles.some(x=>!x)||new Set(s.justifications.warningRoles).size!==3)return fail(i,'Configure os canais e três cargos DIFERENTES antes de ativar.');
    if(!g.siteOff?.syncedAt||Date.now()-g.siteOff.syncedAt>10*60000)return fail(i,'Aguarde a sincronização das folgas do site antes de ativar advertências.');
   }
   attendRuntime.setupWarning(g,!s.justifications.autoWarnings);store.save();return present(i,ui.justificationRolesConfig(s));
  }
 }
 if(prefix==='card'&&verb==='cancel'){const c=g.cards[arg];return c?showCancel(i,c):fail(i,'Cartão não encontrado.');}
 if(prefix==='cancel'){
  const c=g.cards[arg],key=`${sid(i)}:${arg}`,ses=cancellations.get(key);
  if(!c||!ses||ses.nonce!==i.customId.split(':')[3]||Date.now()-ses.createdAt>10*60000)return fail(i,'Confirmação vencida. Abra o cartão e tente novamente.');
  if(!(await isSupervisor(i,guild,c.shift)))return fail(i,'Sem permissão neste turno.');
  if(!s.auditChannelId)return fail(i,'Canal de auditoria não configurado.');
  if(locks.has(c.id))return fail(i,'Cartão sendo atualizado.');
  await defer(i);locks.add(c.id);
  try{const affected=core.cancelHours(c,ses.users,{actor:i.user.id,reason:ses.reason});store.save();siteSync.requestUpdate(client);
   await changeRole(guild,c,affected.map(x=>x.userId),false).catch(e=>console.error('Falha ao remover cargo:',e.message));
   const published=await audit(guild,{type:'Cancelamento de horas',cardId:c.id,shift:c.shift,actorId:i.user.id,reason:ses.reason,affected,at:Date.now()});
   await refreshCard(guild,c);cancellations.delete(key);
   return present(i,ui.msg(`✅ Canceladas as horas de ${affected.length} integrante(s). Motivo: ${ui.safe(ses.reason)}. ${published?'Auditoria publicada.':'Auditoria salva, mas não publicada no canal.'}`));
  }finally{locks.delete(c.id);}
 }
 return fail(i,'Botão desconhecido.');
}
async function onSelect(i){const [prefix,verb,arg]=i.customId.split(':');const guild=i.guild,g=db(guild),s=g.settings;
 if(prefix==='begin'){
  const shift=i.values[0],possible=await eligibleShifts(guild,i.user.id);
  if(!possible.includes(shift))return fail(i,'Você não pode iniciar neste turno.');
  if(s.pointMode==='individual')return startSolo(i,shift);
  return i.showModal(modal(`start:${shift}`,'Criar equipe',[{id:'team',label:'Nome da equipe',max:45}]));
 }
 if(prefix==='pick'){
  const ses=sessionFor(i),userId=i.values[0];
  if(!ses||ses.key!==arg||!ses.candidates.some(x=>x.id===userId))return fail(i,'Seleção expirada. Abra o menu novamente.');
  const m=await member(guild,userId);
  if(!core.allowedFor(s.shifts,ses.shift,rolesOf(m),ses.type)||core.busy(g,userId)||core.pendingInvitation(g,userId))return showCandidates(i,ses);
  if(ses.kind==='draft'){
   ses.selected=ses.selected.includes(userId)?ses.selected.filter(id=>id!==userId):[...ses.selected,userId];
   if(ses.selected.length>s.maxMembers-1){ses.selected=ses.selected.filter(id=>id!==userId);return fail(i,'Limite de integrantes atingido.');}
   return present(i,ui.candidateView(ses));
  }
  const c=g.cards[ses.cardId];if(!c||c.status!=='active'||c.leaderId!==i.user.id)return fail(i,'Cartão não está mais disponível.');
  if(c.members.length+Object.keys(c.joinInvites).length>=s.maxMembers)return fail(i,'Equipe completa.');
  await defer(i);const classified=core.allowedFor(s.shifts,c.shift,rolesOf(m),ses.type);
  core.inviteJoin(g,c,userId,i.user.id,classified);store.save();
  let dmSent=true;
  try{await m.user.send(ui.inviteDM(c,guild.id,userId,'join',classified));}
  catch(e){dmSent=false;console.warn('[Convite] PV indisponível para',userId,e.message);}
  sessions.delete(sid(i));return present(i,ui.msg(`📨 Convite criado para <@${userId}> (integrante do turno). O integrante aceita no botão **Meus convites** do painel do servidor.${dmSent?' O PV também foi enviado.':' ⚠️ PV bloqueado: o convite pelo servidor continua disponível.'} As horas só começam após o aceite, sem afetar os colegas.`));
 }
 if(prefix==='mine'){
  const c=g.cards[i.values[0]];if(!c||!c.members.some(m=>m.userId===i.user.id))return fail(i,'Cartão não encontrado.');
  const rows=[];if(c.leaderId===i.user.id&&['active','paused'].includes(c.status))rows.push(ui.row(ui.button(`act:end:${c.id}`,'Encerrar ponto',ButtonStyle.Danger,'🔴')));
  const mine=c.members.find(m=>m.userId===i.user.id);
  const status=`🟦 **Suas horas registradas:** ${core.format(core.durationFor(mine))}`;
  return present(i,ui.v2('📋 MEU CARTÃO',status+'\n\n'+ui.cardText(c),rows));
 }
 if(prefix==='monitor'){
  const c=g.cards[i.values[0]];if(!c||!(await isSupervisor(i,guild,c.shift)))return fail(i,'Você não pode consultar este turno.');
  return present(i,ui.v2('🔎 FISCALIZAÇÃO',ui.cardText(c),[ui.row(ui.button(`card:cancel:${c.id}`,'Cancelar horas',ButtonStyle.Danger,'❌'))]));
 }
 if(prefix==='cancelpick'){
  const c=g.cards[verb];if(!c||!(await isSupervisor(i,guild,c.shift)))return fail(i,'Sem acesso ao cartão.');
  cancellations.set(`${sid(i)}:${c.id}`,{users:i.values,createdAt:Date.now()});
  return i.showModal(modal(`cancelreason:${c.id}`,'Justificativa obrigatória',[{id:'reason',label:'Por que estas horas serão canceladas?',style:TextInputStyle.Paragraph,max:500}]));
 }
 if(prefix==='save'){
  if(!(await isAdmin(i)))return fail(i,'Somente administração pode alterar configurações.');
  const val=i.values||[];
  if(verb==='roles'){if(val.includes(guild.roles.everyone.id))return fail(i,'@everyone não pode ser usado como cargo de turno.');s.shifts[arg].roleIds=val;}
  else if(verb==='super')s.shifts[arg].supervisorRoles=val;
  else if(verb==='log')s.shifts[arg].logChannelId=val[0]||null;
  else if(verb==='service')s.serviceRoleId=val[0]||null;
  else if(verb==='audit')s.auditChannelId=val[0]||null;
   else if(verb==='presence'){s.presenceLogChannelId=val[0]||null;g.attendance.presenceReportStartedAt=Date.now();}
  else if(verb==='just-review')s.justifications.reviewChannelId=val[0]||null;
  else if(verb==='just-log')s.justifications.logChannelId=val[0]||null;
  else if(verb==='just-warning')s.justifications.warningChannelId=val[0]||null;
  else if(/^just-role-[123]$/.test(verb))s.justifications.warningRoles[Number(verb.slice(-1))-1]=val[0]||null;
  else return fail(i,'Campo desconhecido.');
  store.save();siteSync.requestUpdate(client);return present(i,verb==='roles'||verb==='super'||verb==='log'?ui.shiftConfig(s,arg):verb==='presence'?ui.presenceConfig(s):/^just-role-[123]$/.test(verb)?ui.justificationRolesConfig(s):verb.startsWith('just-')?ui.justificationConfig(s):ui.config(s));
 }
 return fail(i,'Seleção desconhecida.');
}
async function onModal(i){const [prefix,verb,arg]=i.customId.split(':');const guild=i.guild,g=db(guild),s=g.settings;
 if(prefix==='cand'&&verb==='query'){
  const ses=sessionFor(i);if(!ses)return fail(i,'Busca expirada, abra o menu novamente.');
  ses.search=i.fields.getTextInputValue('query').trim();ses.page=0;return showCandidates(i,ses);
 }
 if(prefix==='just'&&verb==='submit'){
  if(!s.justifications.reviewChannelId)return fail(i,'O canal de análise ainda não foi configurado.');
  const dateInput=i.fields.getTextInputValue('day').trim(),reason=i.fields.getTextInputValue('reason').trim();
   const count=Number(i.fields.getTextInputValue('days').trim());
   if(!Number.isInteger(count)||count<1||count>60)return fail(i,'Informe de 1 a 60 dias de serviço.');
  const day=parseDateBR(dateInput);
  if(!day)return fail(i,'Informe uma data válida no formato DD/MM/AAAA (ex.: 07/11/2026).');
  const today=attend.localDay(Date.now(),s.timezone),oldest=attend.plusDays(today,-45);
  if(day>attend.plusDays(today,60)||day<oldest)return fail(i,'Data inicial deve estar entre 45 dias atrás e 60 dias à frente.');
  if(reason.length<10)return fail(i,'Explique a ausência com pelo menos 10 caracteres.');
  const actor=await member(guild,i.user.id);const shifts=Object.keys(core.SHIFTS).filter(k=>s.shifts[k].roleIds.some(id=>actor.roles.cache.has(id)));
  if(shifts.length!==1)return fail(i,shifts.length?'Seu perfil possui vários turnos. Peça ao responsável para ajustar seu cargo.':'Você precisa de um cargo de turno para justificar.');
  const shift=shifts[0];
   const dates=attend.requestedDates(day,count,g.siteOff?.data,shift);
   if(dates.at(-1)>attend.plusDays(today,120))return fail(i,'O período solicitado é muito longo.');
  if(Object.values(g.justifications).some(j=>j.userId===i.user.id&&j.shift===shift&&j.status!=='rejected'&&dates.some(d=>j.date===d||j.dates?.includes(d))))return fail(i,'Já existe justificativa pendente ou aprovada em alguma data solicitada.');
  const id=`JST-${String(g.nextJustification++).padStart(6,'0')}`;
  const j={id,userId:i.user.id,date:dates[0],startDate:day,days:count,dates,shift,reason,status:'pending',at:Date.now(),reviewerId:null,decidedAt:null};
  const channel=await fetchText(guild,s.justifications.reviewChannelId,'de análise');
  await channel.send(ui.justificationReview(j));g.justifications[id]=j;store.save();
  await i.user.send({embeds:[ui.justificationDM(j)],allowedMentions:ui.mentions}).catch(()=>{});
  return present(i,ui.msg(`✅ Justificativa ${id} enviada. Aguarde a avaliação.`));
 }
 if(prefix==='start'){
  const shift=verb,name=i.fields.getTextInputValue('team').trim();
  if(name.length<3||name.length>45)return fail(i,'Nome precisa ter 3 a 45 letras.');
  if(ownOpen(guild,i.user.id))return fail(i,'Você já tem ponto em andamento.');
  if(!(await eligibleShifts(guild,i.user.id)).includes(shift))return fail(i,'Turno indisponível para o seu cargo/horário.');
  if(!s.shifts[shift].logChannelId||!s.serviceRoleId)return fail(i,'Configure logs e cargo Em Serviço antes.');
  return startCandidateSession(i,{kind:'draft',shift,type:'normal',draft:{name}});
 }
 if(prefix==='cancelreason'){
  const c=g.cards[verb],key=`${sid(i)}:${verb}`,ses=cancellations.get(key);
  if(!c||!ses||Date.now()-ses.createdAt>10*60000||!(await isSupervisor(i,guild,c.shift)))return fail(i,'Cancelamento expirado.');
  const reason=i.fields.getTextInputValue('reason').trim();if(reason.length<5)return fail(i,'Motivo com pelo menos cinco caracteres.');
  ses.reason=reason;ses.nonce=crypto.randomBytes(4).toString('hex');
  return present(i,ui.v2('⚠️ CONFIRMAR CANCELAMENTO',`**Cartão:** ${c.id}\n**Turno:** ${core.SHIFTS[c.shift]}\n**Membros:** ${ses.users.map(id=>`<@${id}>`).join(' • ')}\n**Cancelado por quê:** ${ui.safe(reason)}\n\nAs horas selecionadas serão invalidadas, mas o histórico permanecerá.`,
   [ui.row(ui.button(`cancel:confirm:${c.id}:${ses.nonce}`,'Confirmar cancelamento',ButtonStyle.Danger,'❌'))]));
 }
 if(prefix==='mod'){
  if(!(await isAdmin(i)))return fail(i,'Somente administradores podem configurar.');
  if(verb==='mandatory'){
   const hours=Number(i.fields.getTextInputValue('hours').trim());
   if(!Number.isInteger(hours)||hours<1||hours>12)return fail(i,'Escolha entre 1 e 12 horas inteiras.');
   s.mandatoryMinutes=hours*60;store.save();siteSync.requestUpdate(client);
   return present(i,ui.mandatoryConfig(s));
  }
  if(verb==='hours'){core.timeMinute(i.fields.getTextInputValue('start'));core.timeMinute(i.fields.getTextInputValue('end'));
   s.shifts[arg].start=i.fields.getTextInputValue('start');s.shifts[arg].end=i.fields.getTextInputValue('end');store.save();return present(i,ui.shiftConfig(s,arg));}
  if(verb==='rules'){
   const min=Number(i.fields.getTextInputValue('min')),max=Number(i.fields.getTextInputValue('max')),minutes=Number(i.fields.getTextInputValue('minutes')),timezone=i.fields.getTextInputValue('timezone').trim();
   if(!Number.isInteger(min)||!Number.isInteger(max)||min<2||max>4||min>max)throw Error('Equipe deve ter entre 2 e 4 pessoas.');
   if(!Number.isInteger(minutes)||minutes<5||minutes>60)throw Error('Convites: 5 a 60 minutos.');
   try{new Intl.DateTimeFormat('pt-BR',{timeZone:timezone}).format(new Date());}catch{throw Error('Fuso inválido. Ex.: America/Sao_Paulo');}
   Object.assign(s,{minMembers:min,maxMembers:max,inviteMinutes:minutes,timezone});store.save();return present(i,ui.config(s));
  }
  if(verb==='visual'){
   const title=i.fields.getTextInputValue('title').trim(),description=i.fields.getTextInputValue('description').trim(),gif=i.fields.getTextInputValue('gif').trim();
   if(!title||!description)throw Error('Título e descrição são obrigatórios.');
   if(gif&&gif.toLowerCase()!=='padrao'){
    const url=new URL(gif);if(url.protocol!=='https:'||!url.pathname.toLowerCase().endsWith('.gif'))throw Error('O GIF precisa ser HTTPS e terminar em .gif.');
    s.panel.customGif=gif;
   }else if(gif.toLowerCase()==='padrao')s.panel.customGif=null;
   s.panel.title=title;s.panel.description=description;store.save();await refreshPanel(guild);return present(i,ui.msg('✅ Visual salvo e painel atualizado.'));
  }
 }
 return fail(i,'Formulário inválido.');
}
async function handleDM(i){
 const [type,action,guildId,cardId]=i.customId.split(':');if(!['dm','dj'].includes(type))return;
 if(!['yes','no'].includes(action))return;
 if(i.inGuild() && i.guildId!==guildId)return fail(i,'O convite pertence a outro servidor.');
 // DMs antigas e botões privados do servidor usam a mesma regra de validação.
 await i.deferUpdate();
 const respond=content=>{
  if(i.inGuild()){
   const payload=ui.v2(/^✅/.test(content)?'✅ CONVITE CONFIRMADO':'📨 SITUAÇÃO DO CONVITE',content,
    [ui.row(ui.button('bp:invites','Ver outros convites',ButtonStyle.Secondary,'📨'))]);
   return i.editReply({components:payload.components,allowedMentions:ui.mentions});
  }
  return i.editReply({content:'',embeds:[ui.dmOutcome(content)],components:[],allowedMentions:ui.mentions});
 };
 const guild=client.guilds.cache.get(guildId)||await client.guilds.fetch(guildId);
 if(!guild)return respond('Servidor indisponível.');
 const g=db(guild),c=g.cards[cardId];if(!c)return respond('Cartão não encontrado.');
 const target=await member(guild,i.user.id).catch(()=>null);
 if(!target)return respond('Você não faz mais parte do servidor.');
 if(locks.has(c.id))return respond('Outro integrante está confirmando. Tente novamente.');
 locks.add(c.id);
 try{
  if(type==='dm'){
   const invited=c.members.some(m=>m.userId===i.user.id&&m.userId!==c.leaderId);
   if(!invited)return respond('Este convite não é para você.');
   if(action==='yes'&&!core.allowedFor(g.settings.shifts,c.shift,rolesOf(target),'normal'))return respond('Você não possui mais o cargo do turno.');
   const all=core.respondInvite(c,i.user.id,action==='yes');store.save();
   if(!all){await refreshCard(guild,c);return respond(action==='yes'?'✅ Aceito. Aguardando os demais integrantes.':'❌ Você recusou o convite.');}
   if(!core.onShift(g.settings.shifts[c.shift],Date.now(),g.settings.timezone)){
    c.status='expired';c.history.push({event:'shift_closed',at:Date.now()});store.save();await refreshCard(guild,c);
    return respond('⌛ O horário do turno acabou antes de todos aceitarem.');
   }
   for(const m of c.members){const live=await member(guild,m.userId);
    if(!core.allowedFor(g.settings.shifts,c.shift,rolesOf(live),'normal')){
     c.status='declined';store.save();await refreshCard(guild,c);
     return respond('⚠️ Um dos integrantes não tem mais o cargo obrigatório. Convite cancelado.');
    }
   }
   await changeRole(guild,c,activeMembers(c),true);
   core.launch(c);store.save();siteSync.requestUpdate(client);await refreshCard(guild,c);
   await audit(guild,{type:'Entrada da equipe',cardId:c.id,shift:c.shift,actorId:i.user.id,at:Date.now()});
   return respond(`✅ Equipe **${ui.safe(c.name)}** iniciou o serviço!`);
  }
  const inv=c.joinInvites?.[i.user.id];if(!inv||inv.type!=='normal')return respond('Convite indisponível. Somente integrantes do turno podem entrar.');
  if(action==='yes'){
   const classified=core.allowedFor(g.settings.shifts,c.shift,rolesOf(target),inv.type);
   if(!classified||classified.originShift!==inv.originShift)return respond('Seu cargo do turno mudou. Solicite novo convite.');
   if(core.busy(g,i.user.id))return respond('Você já está em outra equipe.');
   await changeRole(guild,c,[i.user.id],true);
   try{core.respondJoin(g,c,i.user.id,true);}catch(e){await changeRole(guild,c,[i.user.id],false);throw e;}
  }else core.respondJoin(g,c,i.user.id,false);
  store.save();siteSync.requestUpdate(client);await refreshCard(guild,c);
  await audit(guild,{type:action==='yes'?'Membro aceitou':'Convite recusado',cardId:c.id,shift:c.shift,actorId:i.user.id,at:Date.now()});
  return respond(action==='yes'?`✅ Você entrou na equipe ${ui.safe(c.name)} como integrante do turno. Contagem iniciada agora.`:'❌ Convite recusado.');
 }finally{locks.delete(c.id);}
}
async function syncGuild(guild){try{await guild.commands.set(commands.map(c=>c.toJSON()));console.log(`✅ /painelbateponto em ${guild.name}`);}catch(e){console.error(`Falha sincronização ${guild.id}:`,e.message);}}
client.once(Events.ClientReady,async()=>{console.log(`✅ Central de Ponto conectada como ${client.user.tag}`);for(const guild of client.guilds.cache.values()){await syncGuild(guild);await refreshAllPanels(guild);}await autoCloseAll();});
client.on(Events.GuildCreate,async guild=>{await syncGuild(guild);await refreshAllPanels(guild);});
client.on(Events.InteractionCreate,async i=>{
 try{
  if(i.isButton()&&/^(dm|dj):/.test(i.customId))return handleDM(i);
  if(!i.inGuild())return;
  if(await welcome.handle(i))return;
  if(await meetingV2.handle(i))return;
  if(await neroModules.handle(i))return;
  if(i.isChatInputCommand()){
   if(i.commandName==='fiscalizarponto')return showMonitor(i);
   if(i.commandName==='testarcomprovante'){
    const owner=process.env.BOT_OWNER_DISCORD_ID===i.user.id;
    if(!owner&&!(await isAdmin(i)))return fail(i,'Somente administração ou dono do bot pode testar o comprovante.');
    await i.deferReply({flags:eph});
    const now=Date.now(),dummy=core.defaultGuild();
    const card=core.createSoloCard(dummy,{shift:'noite',leaderId:i.user.id,now:now-60*60000});
    card.name='TESTE SEM REGISTRO DE HORAS';core.finish(card,i.user.id,now);
    const user=i.user;
    const result=await sendReceiptDM({user,card,member:card.members[0],displayName:i.member?.displayName||user.globalName||user.username,
     username:user.username,avatarUrls:[user.displayAvatarURL({extension:'png',size:256,forceStatic:true}),user.defaultAvatarURL].filter(Boolean),
     timezone:setting(i.guild).timezone,notifications:{pointDm:true,receiptImage:false},logger:console});
    return i.editReply({content:result.sent?
      'Comprovante de teste enviado como mensagem no seu PV, sem imagens ou anexos. Nenhuma hora foi registrada.':
      'Não consegui enviar no privado. Ative as mensagens privadas do servidor e confira os logs da Discloud. Nenhuma hora foi registrada.',
     allowedMentions:ui.mentions});
   }
   if(i.commandName==='testepresenca'){
    const owner=process.env.BOT_OWNER_DISCORD_ID===i.user.id;
    if(!owner&&!(await isAdmin(i)))return fail(i,'Somente o dono do bot ou um administrador pode testar.');
    const g=db(i.guild),date=i.options.getString('data')||attend.plusDays(attend.localDay(Date.now(),g.settings.timezone),-1);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return fail(i,'Data inválida: AAAA-MM-DD');
    const off=g.siteOff?.data||{weekly:{all:[0]},dates:[]},roster=g.attendance.rosters[date];
    if(!roster)return present(i,ui.v2('TESTE DE PRESENÇA','Não há escala registrada nesta data. Nenhum aviso foi enviado.'));
    const lines=[];for(const [shift,users] of Object.entries(roster.shifts))for(const userId of users){const v=attend.evaluation(g,{date,shift,userId,off,tz:g.settings.timezone});lines.push(`<@${userId}> · ${core.SHIFTS[shift]} · ${v.status} · ${v.minutes||0} min`)}
    return present(i,ui.v2('TESTE DE PRESENÇA — SEM EFEITOS',`**Data:** ${date}\n**Advertência automática:** ${g.settings.justifications.autoWarnings?'Ativada':'Desligada'}\n\n${lines.slice(0,35).join('\n')||'Sem integrantes'}\n\n-# Este teste não atribui cargo, não altera horas e não envia advertências.`));
   }
   if(!['painelbateponto','paineljustificativas'].includes(i.commandName))return;
   if(!(await isAdmin(i)))return fail(i,'Somente administradores podem publicar o painel.');
   await i.deferReply({flags:eph});const ch=i.options.getChannel('canal')||i.channel;
   if(!ch?.send)throw Error('Canal inválido.');
   const s=setting(i.guild);
   if(i.commandName==='paineljustificativas'){
    if(s.justifications.panel?.channelId===ch.id){
     const ok=await refreshJustificationPanel(i.guild);
     return i.editReply(ok?'Painel de justificativas existente sincronizado.':'Não foi possível acessar o canal configurado; confira as permissões do bot.');
    }
    const posted=await ch.send(ui.justificationPanel(false,s.justifications.panelVisual));s.justifications.panel={channelId:ch.id,messageId:posted.id};store.save();
    return i.editReply({content:`Painel de justificativas publicado em <#${ch.id}>. Ele será atualizado automaticamente nas próximas versões.`,allowedMentions:ui.mentions});
   }
   if(s.panel.published?.channelId===ch.id){
    const ok=await refreshPanel(i.guild);
    return i.editReply(ok?'Painel de bate-ponto existente sincronizado.':'Não foi possível acessar o painel salvo; confira as permissões do bot.');
   }
   const posted=await ch.send(ui.panel(s.panel,s.pointMode));
   s.panel.published={channelId:ch.id,messageId:posted.id};store.save();
   return i.editReply({content:`✅ Painel publicado em <#${ch.id}>. Atualizações futuras serão aplicadas automaticamente.`,allowedMentions:ui.mentions});
  }
  if(i.isButton())return onButton(i);
  if(i.isAnySelectMenu())return onSelect(i);
  if(i.isModalSubmit())return onModal(i);
 }catch(e){console.error('Erro na interação:',e);try{await fail(i,e.message||'Erro inesperado.');}catch(e2){console.error('Falha ao enviar erro:',e2.message);}}
});
client.on(Events.Error,e=>console.error('Erro do Discord:',e));
process.on('unhandledRejection',e=>console.error('Rejeição inesperada:',e));
process.on('uncaughtException',e=>console.error('Erro crítico:',e));
welcome.install(client);
siteSync.install(client);
attendRuntime.install(client);
presenceReports.install(client);
setInterval(()=>autoCloseAll().catch(err=>console.error('Ponto automático:',err.message)),15000).unref?.();
client.login(token).catch(e=>{console.error('Falha no login:',e.message);process.exitCode=1;});
