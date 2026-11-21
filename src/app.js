'use strict';
require('dotenv').config();
const {
 Client,GatewayIntentBits,Events,PermissionFlagsBits,MessageFlags,ChannelType,ButtonStyle,
 ActionRowBuilder,ButtonBuilder,StringSelectMenuBuilder,AttachmentBuilder
}=require('discord.js');
const {guildData,save,nextId}=require('./store');
const {MODULES,PANELS,TURNS,cfg,secureText,validateBannerUrl}=require('./config');
const {commands,byCommand}=require('./commands');
const ui=require('./ui');const modals=require('./modals');const team=require('./team');
const mg=require('./management');const recruit=require('./recruitment');
const {readRpImage,imageAttachment}=require('./uploads');
const token=process.env.DISCORD_TOKEN;
if(!token||token==='COLE_SEU_TOKEN_AQUI'){console.error('❌ Falta DISCORD_TOKEN no ambiente da hospedagem.');process.exit(1);}
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const recruitSessions=new Map(),teamNames=new Map(),mgSessions=new Map(),activeLocks=new Set();
const EPHEMERAL=MessageFlags.Ephemeral;
const now=()=>Date.now();
const sessionsKey=i=>`${i.guildId}:${i.user.id}`;
const data=i=>guildData(i.guildId);
const sleepMessage=payload=>{const {flags,...rest}=payload;return rest;};
async function show(i,payload){
 if(i.isMessageComponent()&&i.message?.flags?.has(EPHEMERAL)&&Boolean(i.message.flags.has(MessageFlags.IsComponentsV2))===Boolean((payload.flags||0)&MessageFlags.IsComponentsV2))return i.update(sleepMessage(payload));
 return i.reply(payload);
}
async function deny(i,message){const payload=ui.ephemeral(`❌ ${message}`);if(i.deferred||i.replied)return i.followUp(payload);return i.reply(payload);}
async function member(i){return i.guild.members.fetch(i.user.id);}
async function botMember(i){return i.guild.members.fetchMe();}
async function admin(i){return (await member(i)).permissions.has(PermissionFlagsBits.ManageGuild);}
async function leader(i,m,p){const role=cfg(data(i),m,p).roles.lider;return (await admin(i))||!!role&&(await member(i)).roles.cache.has(role);}
async function authorized(i,m,p){const role=cfg(data(i),m,p).roles.acesso;return !role||(await admin(i))||(await member(i)).roles.cache.has(role);}
async function checkConfig(i){if(!(await admin(i)))throw Error('Somente administradores podem configurar os painéis.');}
async function fetchChannel(i,id,name,privateOnly=false){
 if(!id)throw Error(`Configure o canal de ${name} na engrenagem do painel.`);
 const c=await i.guild.channels.fetch(id);
 if(!c||c.type!==ChannelType.GuildText||typeof c.send!=='function')throw Error(`Canal de ${name} inválido.`);
 if(privateOnly&&c.permissionsFor(i.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel))throw Error(`O canal ${name} precisa ser privado, sem acesso de @everyone.`);
 return c;
}
async function notify(i,m,p,label,message,privateOnly=false,attachment=null){
 const channel=await fetchChannel(i,cfg(data(i),m,p).channels.logs,'logs',privateOnly);
 await channel.send({content:`**${label} • ${MODULES[m].label}**\n${message}`,...(attachment?{files:[attachment]}:{}),allowedMentions:ui.MENTIONS});
}
async function optionalLog(i,m,p,label,message){const target=cfg(data(i),m,p).channels.logs;if(!target)return;try{await notify(i,m,p,label,message);}catch(e){console.error('Log falhou:',e.message);}}
async function pm(user,message){try{await user.send({content:message,allowedMentions:ui.MENTIONS});}catch{}}
async function publish(i,m,p,target){const g=data(i),payload=ui.panel(g,m,p);const message=await target.send(payload);
 cfg(g,m,p).published={channelId:target.id,messageId:message.id};save();return message;
}
async function refresh(i,m,p){const post=cfg(data(i),m,p).published;if(!post)return;
 try{const channel=await i.guild.channels.fetch(post.channelId);const msg=await channel.messages.fetch(post.messageId);await msg.edit({...ui.panel(data(i),m,p),attachments:[]});}
 catch(err){console.error(`Atualização do painel ${p}/${m}: ${err.message}`);}
}
async function changeRoles(i,target,add=[],remove=[],reason='Sistema RP'){
 const a=[...new Set(add.filter(Boolean))].filter(id=>!target.roles.cache.has(id));
 const r=[...new Set(remove.filter(Boolean))].filter(id=>target.roles.cache.has(id)&&!a.includes(id));
 const actor=await member(i),bot=await botMember(i);
 mg.ensureRoleChangeAllowed(i.guild,actor,bot,[...a,...r]);
 // Prefere uma edição atômica de cargos, em vez de remover e adicionar separadamente.
 const combined=target.roles.cache.map(x=>x.id).filter(id=>!r.includes(id)).concat(a);
 await target.roles.set([...new Set(combined)],reason);
 return {added:a,removed:r};
}
async function dutyRole(i,t,enabled){if(!t.serviceRoleId)return;
 const changed=[];try{
  for(const id of t.members){
   const target=await i.guild.members.fetch(id);const had=target.roles.cache.has(t.serviceRoleId);
   await changeRoles(i,target,enabled?[t.serviceRoleId]:[],enabled?[]:[t.serviceRoleId],`Bate-ponto em equipe ${t.id}`);
   if(had!==enabled)changed.push({target,had});
  }
 }catch(err){for(const {target,had} of changed.reverse()){
    try{await changeRoles(i,target,had?[t.serviceRoleId]:[],had?[]:[t.serviceRoleId],'Reversão do cargo após falha parcial');}
    catch(rollback){console.error('Falha ao reverter cargo:',rollback.message);}
   }throw err;}
}
async function rankRefresh(i,m,users){const c=cfg(data(i),m,'bateponto');
 for(const u of users){try{
  const total=team.ranking(data(i),m).find(x=>x.userId===u)?.ms||0;
  const level=total>=c.rankMinutes[2]*60000?3:total>=c.rankMinutes[1]*60000?2:total>=c.rankMinutes[0]*60000?1:0;
  const roles=c.roles.rank.filter(Boolean),next=level?c.roles.rank[level-1]:null;
  if(!roles.length)continue;
  const target=await i.guild.members.fetch(u);await changeRoles(i,target,next?[next]:[],roles.filter(id=>id!==next),`Ranking RP: nível ${level}`);
 }catch(err){console.error('Falha ao atualizar rank:',err.message);}}
}
async function publishMovement(i,m,mode,body){const c=cfg(data(i),m,'gestao');const key=mode==='promocao'?'promocoes':mode==='rebaixamento'?'rebaixamentos':'advertencias';
 const out=c.channels[key];if(out){const target=await fetchChannel(i,out,key);await target.send({content:body,allowedMentions:ui.MENTIONS});}
 await optionalLog(i,m,'gestao',`Gestão · ${mode}`,body);
}
function valuesFor(type,keys){return keys.map(([value,label])=>({value,label}));}
async function settingsInteraction(i,kind,m,p){
 const g=data(i),c=cfg(g,m,p);await checkConfig(i);
 if(kind==='home')return show(i,ui.settingsMenu(g,m,p));
 if(kind==='questions')return show(i,ui.recruitmentQuestionMenu(g,m));
 if(kind==='messages')return show(i,ui.recruitmentMessageMenu(g,m));
 if(kind==='visual')return show(i,ui.choiceMenu(m,'🎞️ Identidade visual',`Alterações somente neste painel de ${PANELS[p].label}.`,valuesFor(p,[['title','Título'],['description','Descrição'],['banner','Banner GIF animado']]),`visChoose:${m}:${p}`));
 if(kind==='turns')return show(i,ui.choiceMenu(m,'🕒 Cargos por turno',Object.entries(TURNS).map(([k,n])=>`${n}: ${c.roles.turnos[k]?`<@&${c.roles.turnos[k]}>`:'Não configurado'}`).join('\n'),Object.entries(TURNS).map(([value,label])=>({value,label})),`turnConfig:${m}`));
 if(kind==='ranks')return show(i,ui.choiceMenu(m,'🏅 Patentes e tags',ui.rankInfo(g,m),Array.from({length:20},(_,i)=>({value:String(i),label:`Nível ${i+1}`,description:c.roles.patentes[i]?'Trocar a patente atual':'Definir cargo deste nível'})),`rankSlot:${m}`));
 if(kind==='warnings')return show(i,ui.choiceMenu(m,'📌 Cargos de advertência','Níveis 1, 2 e 3. Ao chegar ao 3, a equipe será desligada e as patentes removidas.',[1,2,3].map(n=>({value:String(n-1),label:`Advertência ${n}`,description:c.roles.advertencias[n-1]?'Cargo atual configurado':'Definir cargo'})),`warnSlot:${m}`));
 if(kind==='limits'&&p==='bateponto')return i.showModal(modals.dutyLimits(m,c));
 if(kind==='rankroles')return show(i,ui.choiceMenu(m,'🏆 Cargos do ranking',`Metas atuais: ${c.rankMinutes.join(' / ')} minutos.`,[1,2,3].map(n=>({value:String(n-1),label:`Ranking nível ${n}`})),`rankTeamSlot:${m}`));
 if(kind==='roles'){
  const opts=[['lider','Liderança / responsável'],['acesso','Acesso ao sistema']];
  if(p==='recrutamento')opts.push(['avaliador','Avaliador'],['aprovado','Aprovado']);
  if(p==='registro')opts.push(['registrado','Registrado']);
  if(p==='bateponto')opts.push(['servico','Em serviço']);
  if(p==='gestao')opts.push(['integrante','Integrante'],['exonerado','Exonerado'],['exonerarExtra','Cargos extras a remover']);
  return show(i,ui.choiceMenu(m,'👥 Cargos deste painel','Cada sistema tem seus próprios cargos, sem afetar os outros.',valuesFor(p,opts),`roleChoose:${m}:${p}`));
 }
 if(kind==='channels'){
  const opts=[['logs','Logs do painel']];
  if(p==='recrutamento')opts.push(['analises','Análises privadas']);
  if(p==='gestao')opts.push(['promocoes','Publicações de promoções'],['rebaixamentos','Publicações de rebaixamentos'],['advertencias','Publicações de advertências']);
  return show(i,ui.choiceMenu(m,'📁 Canais deste painel','Escolha onde o bot vai enviar cada tipo de mensagem.',valuesFor(p,opts),`channelChoose:${m}:${p}`));
 }
 throw Error('Opção de configuração desconhecida.');
}
async function forms(i,prefix,m){const c=cfg(data(i),m,prefix);
 if(!(await authorized(i,m,prefix)))return deny(i,'Você não possui o cargo de acesso definido neste painel.');
 if(prefix==='registro')return show(i,ui.choiceMenu(m,'🪪 Registro do personagem','Selecione o seu turno antes de abrir o formulário.',Object.entries(TURNS).map(([value,label])=>({value,label})),`regTurn:${m}`));
 if(prefix==='recrutamento'){
  if(!c.channels.analises)return deny(i,'A liderança precisa configurar o canal privado de análises.');
  const active=Object.values(data(i).applications).find(x=>x.module===m&&x.userId===i.user.id&&x.status==='pending');
  if(active)return deny(i,`Você já possui uma candidatura pendente (${active.id}).`);
  const key=sessionsKey(i),r=c.recruitment;
  recruitSessions.set(key,{module:m,startedAt:now(),questions:r.questions.map(x=>({...x})),answers:{},page:0});
  return show(i,ui.ephemeral(recruit.renderMessage(r.messages.welcome,{equipe:MODULES[m].label,total:r.questions.length}),[ui.row(ui.btn(`recNext:${m}`,'Abrir primeira etapa',ButtonStyle.Success,'📝'))]));
 }
}
async function onRecruitNext(i,m){const session=recruitSessions.get(sessionsKey(i));if(!session||session.module!==m||now()-session.startedAt>30*60000)return deny(i,'Formulário expirado. Inicie novamente.');
 return i.showModal(modals.recPage(m,session.page,session.questions));}
async function onRecruitSubmit(i,m,page){const g=data(i),session=recruitSessions.get(sessionsKey(i));if(!session||session.module!==m||session.page!==page||now()-session.startedAt>30*60000)return deny(i,'Formulário expirado, reabra no painel.');
 Object.assign(session.answers,recruit.collectAnswers(i.fields,session.questions,page));
 if(page<recruit.pageCount(session.questions)-1){session.page++;const r=cfg(g,m,'recrutamento').recruitment;return i.reply(ui.ephemeral(recruit.renderMessage(r.messages.next,{equipe:MODULES[m].label,pagina:session.page+1,paginas:recruit.pageCount(session.questions)}),[ui.row(ui.btn(`recNext:${m}`,'Continuar',ButtonStyle.Primary,'➡️'))]));}
 await i.deferReply({flags:EPHEMERAL});
 const c=cfg(g,m,'recrutamento'),review=await fetchChannel(i,c.channels.analises,'análises',true);
 const imageValue=i.fields.getUploadedFiles('rg_rp')?.first();const photo=await readRpImage(imageValue);
 const id=nextId(i.guildId,'REC');const entry={id,module:m,userId:i.user.id,answers:recruit.fieldsFromAnswers(session.questions,session.answers),status:'pending',createdAt:now()};
 g.applications[id]=entry;save();
 const content=`📋 **CANDIDATURA RP · ${id}**\n👤 Candidato: <@${i.user.id}>\n${Object.entries(entry.answers).map(([q,a])=>`**${secureText(q,115)}**\n${secureText(a,750)}`).join('\n\n')}`.slice(0,1900);
 const file=photo?imageAttachment(photo,id):null;
 try{await review.send({content,allowedMentions:ui.MENTIONS,...(file?{files:[file]}:{}),components:[ui.row(ui.btn(`review:approve:${m}:${id}`,'Aprovar',ButtonStyle.Success,'✅'),ui.btn(`review:reject:${m}:${id}`,'Reprovar',ButtonStyle.Danger,'❌'))]});}
 catch(err){delete g.applications[id];save();throw err;}
 recruitSessions.delete(sessionsKey(i));await optionalLog(i,m,'recrutamento','Ficha recebida',`${id} • ${i.user.id}`);
 return i.editReply({content:recruit.renderMessage(c.recruitment.messages.submitted,{equipe:MODULES[m].label,protocolo:id})});
}
async function onReview(i,m,id,action){const g=data(i),entry=g.applications[id];if(!entry||entry.module!==m||entry.status!=='pending')return deny(i,'Essa ficha já foi avaliada.');
 const c=cfg(g,m,'recrutamento'),reviewRole=c.roles.avaliador;
 if(!(await leader(i,m,'recrutamento'))&&(!reviewRole||!(await member(i)).roles.cache.has(reviewRole)))return deny(i,'Somente avaliador ou liderança.');
 if(activeLocks.has(id))return deny(i,'Outra decisão está em andamento.');activeLocks.add(id);
 try{await i.deferReply({flags:EPHEMERAL});
  if(action==='approve'&&c.roles.aprovado){const target=await i.guild.members.fetch(entry.userId);await changeRoles(i,target,[c.roles.aprovado],[],'Aprovação em recrutamento RP');}
  entry.status=action==='approve'?'approved':'rejected';entry.reviewedBy=i.user.id;entry.reviewedAt=now();save();
  const msg=recruit.renderMessage(c.recruitment.messages[action==='approve'?'approved':'rejected'],{protocolo:id,equipe:MODULES[m].label});
  await pm(await client.users.fetch(entry.userId),msg);
  await optionalLog(i,m,'recrutamento',`Ficha ${entry.status}`,`${id} • ${entry.userId} • Avaliador: ${i.user.id}`);
  await i.message.edit({components:[],content:`${i.message.content}\n\n**${action==='approve'?'✅ APROVADO':'❌ REPROVADO'} por <@${i.user.id}>**`,allowedMentions:ui.MENTIONS}).catch(console.error);
  return i.editReply({content:`✅ Candidatura ${id} ${action==='approve'?'aprovada':'reprovada'}.`});
 }finally{activeLocks.delete(id);}
}
async function onRegistration(i,m,turn){const g=data(i),c=cfg(g,m,'registro');
 await i.deferReply({flags:EPHEMERAL});
 if(!c.channels.logs)throw Error('Configure um canal privado de logs no Registro.');
 const channel=await fetchChannel(i,c.channels.logs,'registro',true);
 const fields={nome:i.fields.getTextInputValue('nome'),identificador:i.fields.getTextInputValue('idrp'),setor:i.fields.getTextInputValue('area')};
 const photo=await readRpImage(i.fields.getUploadedFiles('rg_rp')?.first());
 if(!c.roles.turnos[turn])throw Error(`A liderança ainda não configurou o cargo do turno ${TURNS[turn]}.`);
 const target=await member(i);const all=Object.values(c.roles.turnos).filter(Boolean);
 await changeRoles(i,target,[c.roles.turnos[turn],c.roles.registrado].filter(Boolean),all.filter(id=>id!==c.roles.turnos[turn]),'Registro RP e turno');
 const id=nextId(i.guildId,'REG');const entry={id,module:m,userId:i.user.id,turn,fields,createdAt:now()};
 g.registrations[`${m}:${i.user.id}`]=entry;save();
 await channel.send({content:`🪪 **REGISTRO RP ${id}**\n👤 <@${i.user.id}>\n**Personagem:** ${secureText(fields.nome)}\n**ID fictício:** ${secureText(fields.identificador)}\n**Setor:** ${secureText(fields.setor)}\n**Turno:** ${TURNS[turn]}`,allowedMentions:ui.MENTIONS,...(photo?{files:[imageAttachment(photo,id)]}:{})});
 return i.editReply({content:`✅ Personagem registrado! Turno selecionado: **${TURNS[turn]}**. Protocolo ${id}.`});
}
async function onTeamCreate(i,m){if(!(await authorized(i,m,'bateponto')))return deny(i,'Você não possui acesso ao bate-ponto.');
 if(!cfg(data(i),m,'bateponto').roles.servico)return deny(i,'A liderança precisa configurar o cargo Em serviço antes de criar equipes.');
 if(team.busy(data(i),m,i.user.id))return deny(i,'Você já participa de uma equipe com cartão aberto.');
 return i.showModal(modals.teamName(m));}
async function onTeamName(i,m){const name=i.fields.getTextInputValue('nome').trim();if(name.length<3||name.length>45)throw Error('O nome da equipe deve ter entre 3 e 45 caracteres.');
 teamNames.set(sessionsKey(i),{m,name,createdAt:now()});
 return i.reply(ui.ephemeral(`👑 **Líder:** <@${i.user.id}>\n**Equipe:** ${secureText(name)}\nSelecione de 1 a 3 convidados (2 a 4 pessoas contando com você).`,[ui.row(new (require('discord.js').UserSelectMenuBuilder)().setCustomId(`tmMembers:${m}`).setPlaceholder('Escolha 1 a 3 integrantes').setMinValues(1).setMaxValues(3))]));
}
async function onTeamMembers(i,m){const dataName=teamNames.get(sessionsKey(i));if(!dataName||dataName.m!==m||now()-dataName.createdAt>10*60000)return deny(i,'Sessão expirada, comece novamente.');
 const invited=i.values;
 for(const memberId of invited){const checked=await i.guild.members.fetch(memberId);if(checked.user.bot)return deny(i,'Não inclua bots na equipe.');}
 const g=data(i),id=nextId(i.guildId,'EQ');const c=cfg(g,m,'bateponto');
 const t=team.startInvite(g,{id,module:m,leaderId:i.user.id,name:dataName.name,invitees:invited,expiryMs:c.inviteMinutes*60_000});
 try{await i.channel.send({content:`👥 **CONVITE PARA EQUIPE RP — ${secureText(t.name)}**\n👑 Líder: <@${t.leaderId}>\n📬 Convidados: ${invited.map(u=>`<@${u}>`).join(' · ')}\n⏳ Todos precisam aceitar em até ${c.inviteMinutes} minutos para iniciar o cartão **${id}**.`,allowedMentions:{users:invited},components:[ui.row(ui.btn(`tmAccept:${id}`,'Aceitar convite',ButtonStyle.Success,'✅'),ui.btn(`tmReject:${id}`,'Recusar',ButtonStyle.Danger,'❌'))]});}
 catch(err){delete g.teams[id];save();throw err;}
 for(const userId of invited)await pm(await client.users.fetch(userId),`👥 Você foi convidado para a equipe RP "${t.name}" (${id}) no servidor ${i.guild.name}. Abra o canal onde recebeu o convite e clique em Aceitar.`);
 save();teamNames.delete(sessionsKey(i));return i.reply(ui.ephemeral(`✅ Convite **${id}** publicado. O bate-ponto começa somente após todos os ${t.members.length} integrantes aceitarem.`));
}
async function onTeamAccept(i,id,accept){const g=data(i),t=g.teams[id];if(!t)return deny(i,'Equipe inexistente.');
 if(!t.members.includes(i.user.id)||i.user.id===t.leaderId)return deny(i,'Somente integrantes convidados podem responder.');
 if(t.status!=='pending')return deny(i,'Este convite não está pendente.');
 if(now()>t.expiresAt){t.status='expired';save();return deny(i,'Convite expirado.');}
 if(activeLocks.has(id))return deny(i,'Outra resposta está sendo processada.');activeLocks.add(id);
 try{await i.deferReply({flags:EPHEMERAL});
  if(!accept){team.cancel(g,id,i.user.id);save();await i.channel.send({content:`❌ Equipe **${secureText(t.name)}** cancelada: um convidado recusou.`,allowedMentions:ui.MENTIONS});return i.editReply({content:'Convite recusado. O cartão foi cancelado.'});}
  const res=team.accept(g,id,i.user.id);save();
  if(!res.allAccepted)return i.editReply({content:`✅ Aceite registrado (${t.accepted.length}/${t.members.length}). O cartão ainda não foi iniciado.`});
  const c=cfg(g,t.module,'bateponto');if(!c.roles.servico)throw Error('Configure primeiro o cargo Em serviço no painel de bate-ponto. Os aceites foram preservados.');
  t.serviceRoleId=c.roles.servico;
  await dutyRole(i,t,true);
  team.launch(g,id,c.roles.servico);save();
  await optionalLog(i,t.module,'bateponto','🟢 Equipe iniciou o ponto',`${t.id} • ${secureText(t.name)} • ${t.members.join(', ')}`);
  await i.channel.send({content:`🟢 **BATE-PONTO INICIADO**\n**Equipe:** ${secureText(t.name)}\n**Cartão:** ${t.id}\n**Integrantes:** ${t.members.map(u=>`<@${u}>`).join(' · ')}`,allowedMentions:ui.MENTIONS});
  await refresh(i,t.module,'bateponto');return i.editReply({content:'✅ Todos aceitaram! O cartão da equipe foi iniciado e os cargos de serviço foram entregues.'});
 }finally{activeLocks.delete(id);}
}
function leadTeam(g,m,userId){return team.list(g,m).slice().reverse().find(t=>t.leaderId===userId&&['active','paused'].includes(t.status));}
async function teamChange(i,m,action){const g=data(i),t=leadTeam(g,m,i.user.id);
 if(!t)return deny(i,'Você não possui uma equipe ativa como líder.');
 if(activeLocks.has(t.id))return deny(i,'Cartão está sendo atualizado.');activeLocks.add(t.id);
 try{await i.deferReply({flags:EPHEMERAL});
  if(action==='pause'){if(t.status!=='active')throw Error('O cartão já está pausado.');await dutyRole(i,t,false);team.pause(g,t.id,i.user.id);}
  if(action==='resume'){if(t.status!=='paused')throw Error('O cartão não está pausado.');await dutyRole(i,t,true);team.resume(g,t.id,i.user.id);}
  if(action==='end'){await dutyRole(i,t,false);team.finish(g,t.id);}
  save();
  if(action==='end')await rankRefresh(i,m,t.members);
  const msg={pause:'⏸️ Equipe pausada',resume:'▶️ Equipe retomada',end:'🔴 Equipe encerrou o ponto'}[action];
  await optionalLog(i,m,'bateponto',msg,`${t.id} • ${secureText(t.name)} • ${team.format(team.workedMs(t))}`);
  await refresh(i,m,'bateponto');return i.editReply({content:`${msg}: **${t.name}** (${t.id}). Tempo válido: ${team.format(team.workedMs(t))}.`});
 }finally{activeLocks.delete(t.id);}
}
async function cancelPicker(i,m){const g=data(i);if(!(await leader(i,m,'bateponto'))&&!team.list(g,m).some(t=>t.leaderId===i.user.id))return deny(i,'Somente líder ou administração pode cancelar.');
 const options=team.list(g,m).slice().reverse().filter(t=>t.status!=='canceled').slice(0,25);
 const isPanelLeader=await leader(i,m,'bateponto');
 const accessible=options.filter(t=>t.leaderId===i.user.id||isPanelLeader);
 if(!accessible.length)return deny(i,'Não existem cartões a cancelar.');
 return show(i,ui.choiceMenu(m,'🗑️ Cancelar cartão de equipe','Escolha o cartão e confirme. Cancelamentos não entram no ranking.',accessible.map(t=>({value:t.id,label:`${t.id} · ${t.name}`.slice(0,95),description:`${t.status} · ${t.members.length} integrantes`})),`tmPickCancel:${m}`));
}
async function confirmCancel(i,m,id){const t=data(i).teams[id];if(!t||t.module!==m)return deny(i,'Cartão inválido.');if(t.leaderId!==i.user.id&&!(await leader(i,m,'bateponto')))return deny(i,'Somente líder do cartão ou liderança do painel.');
 return show(i,ui.v2(m,'🗑️ Confirmar cancelamento',`**Equipe:** ${secureText(t.name)}\n**Cartão:** ${id}\n**Status:** ${t.status}\n⚠️ O tempo deste cartão será excluído do ranking.`,[ui.row(ui.btn(`tmDoCancel:${m}:${id}`,'Confirmar cancelamento',ButtonStyle.Danger,'🗑️'),ui.btn(`tmNoCancel:${m}`,'Voltar',ButtonStyle.Secondary,'↩️'))]));}
async function performCancel(i,m,id){const g=data(i),t=g.teams[id];if(!t||t.module!==m)return deny(i,'Cartão inválido.');if(t.leaderId!==i.user.id&&!(await leader(i,m,'bateponto')))return deny(i,'Você não tem permissão para cancelar este cartão.');
 if(activeLocks.has(id))return deny(i,'Cartão em atualização.');activeLocks.add(id);
 try{await i.deferReply({flags:EPHEMERAL});
  if(['active','paused'].includes(t.status))await dutyRole(i,t,false);
  team.cancel(g,id,i.user.id);save();await rankRefresh(i,m,t.members);
  await optionalLog(i,m,'bateponto','🗑️ Cartão cancelado',`${id} • ${t.name} • Por: ${i.user.id}`);
  await refresh(i,m,'bateponto');return i.editReply({content:`✅ Cartão ${id} cancelado e removido do ranking.`});
 }finally{activeLocks.delete(id);}
}
async function managementStart(i,m,mode){if(!(await leader(i,m,'gestao')))return deny(i,'Somente a liderança pode fazer essa movimentação.');
 return show(i,ui.memberMenu(m,mode==='warn'?'📌 Advertir integrante':mode==='promocao'?'⬆️ Promover integrante':'⬇️ Rebaixar integrante','Escolha o membro. Depois será solicitado o motivo RP.',`mgTarget:${m}:${mode}`));}
async function managementPrepare(i,m,mode,targetId){if(!(await leader(i,m,'gestao')))return deny(i,'Acesso negado.');
 if(targetId===i.user.id)return deny(i,'A liderança não pode registrar movimentações no próprio cargo.');
 const target=await i.guild.members.fetch(targetId);if(target.user.bot)return deny(i,'Não é permitido modificar cargos de bots.');return i.showModal(modals.mgReason(m,mode,targetId));}
async function managementPreview(i,m,mode,targetId){if(!(await leader(i,m,'gestao')))return deny(i,'Acesso negado.');
 const target=await i.guild.members.fetch(targetId),c=cfg(data(i),m,'gestao'),reason=i.fields.getTextInputValue('motivo').trim();if(reason.length<5)throw Error('Informe motivo com pelo menos 5 caracteres.');
 const warningKey=`${m}:${targetId}`,warnEntry=data(i).warnings[warningKey],plan=mode==='warn'?mg.warningPlan(c,warnEntry):mg.movePlan(c,target.roles.cache.map(x=>x.id),mode);
 const key=`${i.guildId}:${i.user.id}:${now()}`;
 mgSessions.set(key,{module:m,targetId,mode,reason,startedAt:now()});
 const showName=mode==='warn'?`📌 Advertência ${plan.level}${plan.exonerate?' · EXONERAÇÃO':''}`:mode==='promocao'?'⬆️ PROMOÇÃO':'⬇️ REBAIXAMENTO';
 return i.reply(ui.v2(m,'✅ Confirmar movimentação',`**Ação:** ${showName}\n**Integrante:** <@${targetId}>\n**Adicionar:** ${plan.add.map(x=>`<@&${x}>`).join(' · ')||'Nenhum'}\n**Remover:** ${plan.remove.map(x=>`<@&${x}>`).join(' · ')||'Nenhum'}\n**Motivo RP:** ${secureText(reason,400)}`, [ui.row(ui.btn(`mgConfirm:${key}`,'Confirmar operação',ButtonStyle.Success,'✅'),ui.btn(`mgAbort:${key}`,'Descartar',ButtonStyle.Danger,'✖️'))]));
}
async function managementConfirm(i,key){const state=mgSessions.get(key);if(!state||now()-state.startedAt>10*60000)return deny(i,'Confirmação expirada.');
 if(!(await leader(i,state.module,'gestao')))return deny(i,'Acesso negado.');
 if(key.split(':')[1]!==i.user.id)return deny(i,'Esta confirmação pertence a outro líder.');
 const g=data(i),m=state.module,target=await i.guild.members.fetch(state.targetId),c=cfg(g,m,'gestao');
 const publishKey=state.mode==='promocao'?'promocoes':state.mode==='rebaixamento'?'rebaixamentos':'advertencias';
 await fetchChannel(i,c.channels[publishKey],publishKey);
 const warnKey=`${m}:${state.targetId}`,warnEntry=g.warnings[warnKey];
 const plan=state.mode==='warn'?mg.warningPlan(c,warnEntry):mg.movePlan(c,target.roles.cache.map(x=>x.id),state.mode);
 if(state.mode==='warn'&&plan.exonerate){
  const rc=cfg(g,m,'registro').roles,cr=cfg(g,m,'recrutamento').roles,dc=cfg(g,m,'bateponto').roles;
  plan.remove=[...new Set([...plan.remove,...Object.values(rc.turnos||{}),rc.registrado,cr.aprovado,dc.servico,...(dc.rank||[])].filter(Boolean))].filter(r=>!plan.add.includes(r));
 }
 if(activeLocks.has(key))return deny(i,'Movimentação em andamento.');activeLocks.add(key);
 try{await i.deferReply({flags:EPHEMERAL});
  await changeRoles(i,target,plan.add,plan.remove,`Gestão RP ${state.mode}: ${state.reason}`);
  const id=nextId(i.guildId,state.mode==='warn'?'ADV':state.mode==='promocao'?'PRO':'REB');
  const record={id,module:m,mode:state.mode,userId:state.targetId,actorId:i.user.id,reason:state.reason,createdAt:now(),add:plan.add,remove:plan.remove};
  g.movements[id]=record;
  if(state.mode==='warn'){
   g.warnings[warnKey]={count:plan.level,entries:[...(warnEntry?.entries||[]),id]};
   if(plan.exonerate){
    const teams=team.list(g,m).filter(t=>t.members.includes(state.targetId)&&['active','paused','pending'].includes(t.status));
    for(const t of teams){
     if(t.serviceRoleId){for(const userId of t.members){try{const u=await i.guild.members.fetch(userId);await changeRoles(i,u,[],[t.serviceRoleId],'Exoneração RP encerrou cartão da equipe');}catch(e){console.error('Não foi possível remover cargo de serviço:',e.message);}}}
     team.cancel(g,t.id,i.user.id);
    }
   }
  }
  save();mgSessions.delete(key);
  const label=state.mode==='warn'?`📌 Advertência ${plan.level}${plan.exonerate?' • EXONERAÇÃO':''}`:state.mode==='promocao'?'⬆️ PROMOÇÃO':'⬇️ REBAIXAMENTO';
  const body=`**${label} · ${id}**\n👤 Integrante: <@${target.id}>\n👑 Responsável: <@${i.user.id}>\n➕ Cargos: ${plan.add.map(x=>`<@&${x}>`).join(' · ')||'Nenhum'}\n➖ Removidos: ${plan.remove.map(x=>`<@&${x}>`).join(' · ')||'Nenhum'}\n📝 Motivo: ${secureText(state.reason,380)}`;
  let published=true;try{await publishMovement(i,m,state.mode,body);}catch(e){published=false;console.error('Falha de publicação:',e.message);}
  await pm(target.user,`${label} registrado no servidor ${i.guild.name}. Motivo RP: ${state.reason}`);
  if(state.mode==='warn'&&plan.exonerate){await refresh(i,m,'bateponto');await rankRefresh(i,m,[target.id]);}
  return i.editReply({content:`✅ ${label} realizada. Protocolo ${id}.${!published?' ⚠️ Não foi possível publicar nos canais configurados.':''}`});
 }finally{activeLocks.delete(key);}
}
async function onComponent(i){
 const parts=i.customId.split(':'),action=parts[0],m=parts[1],p=parts[2];
 if(['regStart','regMine','recStart','recMine','recNext','mgPromote','mgDemote','mgWarn','mgHistory','tmCreate','tmMine','tmList','tmRank','tmPause','tmResume','tmEnd','tmCancel'].includes(action)&&!MODULES[m])throw Error('Módulo inválido.');
 if(action==='settings'){await checkConfig(i);return show(i,ui.settingsMenu(data(i),m,p));}
 if(action==='sm')return settingsInteraction(i,parts[1],parts[2],parts[3]);
 if(action==='regStart')return forms(i,'registro',m);
 if(action==='recStart')return forms(i,'recrutamento',m);
 if(action==='recNext')return onRecruitNext(i,m);
 if(action==='regMine'){const r=data(i).registrations[`${m}:${i.user.id}`];return show(i,ui.ephemeral(r?`🪪 Seu registro RP: ${r.id}\n**Personagem:** ${secureText(r.fields.nome)}\n**Turno:** ${TURNS[r.turn]}`:'Ainda não há registro para você.'));}
 if(action==='recMine'){const r=Object.values(data(i).applications).filter(x=>x.module===m&&x.userId===i.user.id).slice(-1)[0];return show(i,ui.ephemeral(r?`📋 Última ficha: ${r.id}\nStatus: **${r.status}**`:'Você ainda não enviou uma candidatura.'));}
 if(action==='review')return onReview(i,parts[2],parts[3],parts[1]);
 if(action==='tmCreate')return onTeamCreate(i,m);
 if(action==='tmName')return;
 if(action==='tmMine'){const t=team.busy(data(i),m,i.user.id)||team.list(data(i),m).filter(t=>t.members.includes(i.user.id)).slice(-1)[0];return show(i,ui.ephemeral(t?`👥 Equipe **${secureText(t.name)}** (${t.id})\nStatus: ${t.status}\nTempo efetivo: ${team.format(team.workedMs(t))}\nAceites: ${t.accepted.length}/${t.members.length}`:'Você não possui cartão de equipe.'));}
 if(action==='tmList')return show(i,ui.teamView(data(i),m));
 if(action==='tmRank')return show(i,ui.rankingView(data(i),m));
 if(action==='tmPause')return teamChange(i,m,'pause');
 if(action==='tmResume')return teamChange(i,m,'resume');
 if(action==='tmEnd')return teamChange(i,m,'end');
 if(action==='tmCancel')return cancelPicker(i,m);
 if(action==='tmAccept')return onTeamAccept(i,m,true);
 if(action==='tmReject')return onTeamAccept(i,m,false);
 if(action==='tmDoCancel')return performCancel(i,m,p);
 if(action==='tmNoCancel')return show(i,ui.ephemeral('Operação cancelada. Nenhum cartão foi alterado.'));
 if(action==='mgPromote')return managementStart(i,m,'promocao');
 if(action==='mgDemote')return managementStart(i,m,'rebaixamento');
 if(action==='mgWarn')return managementStart(i,m,'warn');
 if(action==='mgHistory'){
  if(!(await leader(i,m,'gestao')))return deny(i,'Histórico disponível somente para a liderança.');
  const rows=Object.values(data(i).movements).filter(x=>x.module===m).sort((a,b)=>b.createdAt-a.createdAt).slice(0,12);
  return show(i,ui.v2(m,'📚 Histórico de gestão',rows.map(x=>`${x.mode==='warn'?'📌':x.mode==='promocao'?'⬆️':'⬇️'} **${x.id}** · <@${x.userId}> · ${secureText(x.reason,110)}`).join('\n')||'Sem movimentações registradas.'));
 }
 if(action==='mgConfirm')return managementConfirm(i,i.customId.slice('mgConfirm:'.length));
 if(action==='mgAbort'){mgSessions.delete(i.customId.slice('mgAbort:'.length));return show(i,ui.ephemeral('✖️ Movimentação descartada.'));}
 if(action==='rq'){
  await checkConfig(i);const operation=parts[1],m=parts[2],r=cfg(data(i),m,'recrutamento').recruitment;
  if(operation==='add')return i.showModal(modals.recQuestion(m,'add',r.questions.length));
  if(['chooseedit','choosedelete'].includes(operation))return show(i,ui.choiceMenu(m,operation==='chooseedit'?'✏️ Editar pergunta':'🗑️ Remover pergunta','Selecione o número desejado.',r.questions.map((q,idx)=>({label:`${idx+1}. ${q.text}`.slice(0,100),value:String(idx)})),`rqIndex:${m}:${operation==='chooseedit'?'edit':'delete'}`));
 }
 if(i.isStringSelectMenu())return handleStringSelect(i);
 if(i.isRoleSelectMenu())return handleRoleSelect(i);
 if(i.isChannelSelectMenu())return handleChannelSelect(i);
 if(i.isUserSelectMenu())return handleUserSelect(i);
 throw Error('Interação não reconhecida. Atualize os painéis para a versão atual.');
}
async function handleStringSelect(i){const [act,m,p,more]=i.customId.split(':'),choice=i.values[0],g=data(i);
 if(act==='regTurn'){if(!TURNS[choice])throw Error('Turno inválido.');if(!(await authorized(i,m,'registro')))return deny(i,'Acesso não autorizado.');return i.showModal(modals.register(m,choice));}
 if(act==='tmPickCancel')return confirmCancel(i,m,choice);
 if(act==='roleChoose'){
  await checkConfig(i);
  if(!['lider','acesso','avaliador','aprovado','registrado','servico','integrante','exonerado','exonerarExtra'].includes(choice))throw Error('Tipo de cargo inválido.');
  return show(i,ui.roleMenu(m,'👥 Configurar cargo',`Painel ${PANELS[p].label} · Campo: ${choice}`,`roleSave:${m}:${p}:${choice}`,choice==='exonerarExtra'?20:1));
 }
 if(act==='channelChoose'){
  await checkConfig(i);if(!Object.hasOwn(cfg(g,m,p).channels,choice))throw Error('Tipo de canal inválido.');
  return show(i,ui.channelMenu(m,'📁 Selecionar canal',`Canal ${choice} • Somente para este painel.`,`channelSave:${m}:${p}:${choice}`));
 }
 if(act==='turnConfig'){
  await checkConfig(i);if(!TURNS[choice])throw Error('Turno inválido.');
  return show(i,ui.roleMenu(m,`🕒 ${TURNS[choice]}`,'Cargo entregue automaticamente quando o usuário registrar este turno.',`roleSave:${m}:registro:turno-${choice}`));
 }
 if(act==='rankSlot'){
  await checkConfig(i);const index=Number(choice);if(!Number.isInteger(index)||index<0||index>=20)throw Error('Nível inválido.');
  return show(i,ui.roleMenu(m,`🏅 Patente ${index+1}`,'O bot usará este cargo na ordem das promoções e dos rebaixamentos.',`roleSave:${m}:gestao:patente-${index}`));
 }
 if(act==='warnSlot'){
  await checkConfig(i);const index=Number(choice);if(!Number.isInteger(index)||index<0||index>2)throw Error('Nível inválido.');
  return show(i,ui.roleMenu(m,`📌 Advertência ${index+1}`,'Na terceira advertência, cargos de patente e integrante serão removidos.',`roleSave:${m}:gestao:advertencia-${index}`));
 }
 if(act==='rankTeamSlot'){
  await checkConfig(i);const index=Number(choice);if(!Number.isInteger(index)||index<0||index>2)throw Error('Nível inválido.');
  return show(i,ui.roleMenu(m,`🏆 Ranking ${index+1}`,'Cargo de rank por horas válidas no ponto em equipe.',`roleSave:${m}:bateponto:rank-${index}`));
 }
 if(act==='visChoose'){
  await checkConfig(i);if(!['title','description','banner'].includes(choice))throw Error('Campo inválido.');
  const c=cfg(g,m,p);return i.showModal(modals.visual(m,p,choice,choice==='title'?c.title:choice==='description'?c.description:c.bannerUrl||'padrao'));
 }
 if(act==='rqIndex'){
  await checkConfig(i);const r=cfg(g,m,'recrutamento').recruitment,index=Number(choice);
  if(!Number.isInteger(index)||index<0||index>=r.questions.length)throw Error('Pergunta não encontrada.');
  if(p==='edit')return i.showModal(modals.recQuestion(m,'edit',index,r.questions[index]));
  recruit.removeQuestion(r,index);save();return show(i,ui.recruitmentQuestionMenu(g,m));
 }
 if(act==='rq'&&m==='choosemsg'){
  const selectedModule=i.customId.split(':')[2],r=cfg(g,selectedModule,'recrutamento').recruitment;
  if(!Object.hasOwn(recruit.MESSAGE_TITLES,choice))throw Error('Mensagem inválida.');
  return i.showModal(modals.recMessage(selectedModule,choice,r.messages[choice]));
 }
 throw Error('Seleção desconhecida.');
}
async function handleRoleSelect(i){await checkConfig(i);
 const [act,m,p,key]=i.customId.split(':');if(act!=='roleSave')throw Error('Seletor de cargos não reconhecido.');
 const c=cfg(data(i),m,p),selected=i.values||[];
 if(key==='exonerarExtra')c.roles.exonerarExtra=selected.slice(0,20);
 else if(key.startsWith('turno-')){const turn=key.slice(6);if(!TURNS[turn]||p!=='registro')throw Error('Turno inválido.');c.roles.turnos[turn]=selected[0]||null;}
 else if(key.startsWith('patente-')){const idx=Number(key.slice(8));if(p!=='gestao'||!Number.isInteger(idx)||idx<0||idx>=20)throw Error('Patente inválida.');c.roles.patentes[idx]=selected[0]||null;}
 else if(key.startsWith('advertencia-')){const idx=Number(key.slice(12));if(p!=='gestao'||!Number.isInteger(idx)||idx<0||idx>=3)throw Error('Advertência inválida.');c.roles.advertencias[idx]=selected[0]||null;}
 else if(key.startsWith('rank-')){const idx=Number(key.slice(5));if(p!=='bateponto'||!Number.isInteger(idx)||idx<0||idx>=3)throw Error('Rank inválido.');c.roles.rank[idx]=selected[0]||null;}
 else{if(!Object.hasOwn(c.roles,key))throw Error('Cargo desconhecido.');c.roles[key]=selected[0]||null;}
 save();return show(i,ui.settingsMenu(data(i),m,p));
}
async function handleChannelSelect(i){await checkConfig(i);const [act,m,p,key]=i.customId.split(':');if(act!=='channelSave')throw Error('Seletor de canal inválido.');
 const c=cfg(data(i),m,p);if(!Object.hasOwn(c.channels,key))throw Error('Tipo de canal desconhecido.');
 c.channels[key]=i.values?.[0]||null;save();return show(i,ui.settingsMenu(data(i),m,p));
}
async function handleUserSelect(i){const [act,m,mode]=i.customId.split(':');if(act==='tmMembers')return onTeamMembers(i,m);if(act==='mgTarget')return managementPrepare(i,m,mode,i.values[0]);throw Error('Seletor de usuário desconhecido.');}
async function onModal(i){const parts=i.customId.split(':'),kind=parts[0],m=parts[1];
 if(kind==='regSubmit')return onRegistration(i,m,parts[2]);
 if(kind==='recSubmit')return onRecruitSubmit(i,m,Number(parts[2]));
 if(kind==='tmName')return onTeamName(i,m);
 if(kind==='tmLimits'){
  await checkConfig(i);const c=cfg(data(i),m,'bateponto');
  const mins=['rank1','rank2','rank3'].map(k=>Number(i.fields.getTextInputValue(k)));
  const expiry=Number(i.fields.getTextInputValue('expira'));
  if(mins.some(n=>!Number.isInteger(n)||n<1||n>200000)||!(mins[0]<mins[1]&&mins[1]<mins[2]))throw Error('As três metas devem ser números crescentes entre 1 e 200000 minutos.');
  if(!Number.isInteger(expiry)||expiry<5||expiry>60)throw Error('O convite deve valer entre 5 e 60 minutos.');
  c.rankMinutes=mins;c.inviteMinutes=expiry;save();return i.reply(ui.settingsMenu(data(i),m,'bateponto'));
 }
 if(kind==='mgReason')return managementPreview(i,m,parts[2],parts[3]);
 if(kind==='visualSubmit'){
  await checkConfig(i);const p=parts[2],key=parts[3],c=cfg(data(i),m,p),s=i.fields.getTextInputValue('texto').trim();
  if(key==='title'){if(s.length<3||s.length>90)throw Error('Título deve ter entre 3 e 90 caracteres.');c.title=s;}
  else if(key==='description'){if(s.length<3||s.length>650)throw Error('Descrição entre 3 e 650 caracteres.');c.description=s;}
  else if(key==='banner')c.bannerUrl=validateBannerUrl(s);
  else throw Error('Campo não reconhecido.');
  save();await i.deferReply({flags:EPHEMERAL});await refresh(i,m,p);return i.editReply({content:'✅ Aparência atualizada somente neste painel.'});
 }
 if(kind==='rqSubmit'){
  await checkConfig(i);const mode=parts[2],index=Number(parts[3]),r=cfg(data(i),m,'recrutamento').recruitment;
  const text=i.fields.getTextInputValue('texto').trim(),type=i.fields.getTextInputValue('tipo').trim().toLowerCase(),required=i.fields.getTextInputValue('obrigatoria').trim().toLowerCase();
  if(!['curta','longa'].includes(type)||!['sim','nao','não'].includes(required))throw Error('Use "curta" ou "longa", e "sim" ou "nao".');
  const question={text,kind:type==='longa'?'long':'short',required:required==='sim'};
  if(mode==='add')recruit.addQuestion(r,question);else if(mode==='edit')recruit.changeQuestion(r,index,question);else throw Error('Ação inválida.');
  save();return i.reply(ui.recruitmentQuestionMenu(data(i),m));
 }
 if(kind==='rmSubmit'){
  await checkConfig(i);const key=parts[2],r=cfg(data(i),m,'recrutamento').recruitment;
  if(!Object.hasOwn(recruit.MESSAGE_TITLES,key))throw Error('Mensagem desconhecida.');
  r.messages[key]=i.fields.getTextInputValue('texto').trim();if(r.messages[key].length<2)throw Error('Texto muito curto.');
  save();return i.reply(ui.recruitmentMessageMenu(data(i),m));
 }
 throw Error('Modal desconhecido.');
}
async function onCommand(i){if(!Object.hasOwn(byCommand,i.commandName))return deny(i,'Comando desativado nesta versão.');
 if(!(await admin(i)))return deny(i,'Apenas administradores podem publicar painéis.');
 const m=i.options.getString('modulo'),p=byCommand[i.commandName];if(!MODULES[m])throw Error('Módulo inválido.');
 const dest=i.options.getChannel('canal')||i.channel;if(!dest||dest.type!==ChannelType.GuildText)throw Error('Selecione um canal de texto.');
 await i.deferReply({flags:EPHEMERAL});
 const out=await publish(i,m,p,dest);return i.editReply({content:`✅ Painel **${PANELS[p].label} • ${MODULES[m].label}** publicado em <#${dest.id}>. Mensagem ${out.id}.\n⚙️ A configuração individual está no próprio painel.`});
}
async function syncCommands(guild){try{const result=await guild.commands.set(commands);console.log(`✅ ${guild.name}: ${result.size} comandos sincronizados.`);}catch(err){console.error(`❌ Comandos em ${guild.name}:`,err.message);}}
client.once(Events.ClientReady,async()=>{
 console.log(`🤖 Bot RP online: ${client.user.tag} • ${client.guilds.cache.size} servidor(es)`);
 try{await client.application.commands.set([]);console.log('✅ Comandos globais antigos removidos.');}catch(e){console.error('Não foi possível limpar comandos globais antigos:',e.message);}
 for(const guild of client.guilds.cache.values())await syncCommands(guild);
});
client.on(Events.GuildCreate,syncCommands);
client.on(Events.InteractionCreate,async i=>{
 if(!i.inGuild())return;
 try{
  if(i.isChatInputCommand())return await onCommand(i);
  if(i.isModalSubmit())return await onModal(i);
  if(i.isButton()||i.isStringSelectMenu()||i.isRoleSelectMenu()||i.isChannelSelectMenu()||i.isUserSelectMenu())return await onComponent(i);
 }catch(err){console.error(`❌ Interação ${i.customId||i.commandName}:`,err);
  try{await deny(i,err.message||'Erro inesperado na operação.');}catch(e){console.error('Resposta de erro falhou:',e.message);}
 }
});
client.on(Events.Error,e=>console.error('Cliente Discord:',e));
process.on('unhandledRejection',e=>console.error('Erro assíncrono:',e));
process.on('uncaughtException',e=>{console.error('Exceção não tratada:',e);process.exitCode=1;});
client.login(token).catch(err=>{console.error('Não foi possível conectar ao Discord:',err.message);process.exitCode=1;});
