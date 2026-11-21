'use strict';
require('dotenv').config();
const {
  Client, GatewayIntentBits, Events, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const { guildData, nextId, save } = require('./store');
const { MODULES, TYPES, PANEL_ROLES, PANEL_CHANNELS, panelSettings, effectiveRole, effectiveRankRoles, effectiveChannel } = require('./config');
const {
  panel, reviewCard, ticketCard, settingsCard, globalSettingsCard, panelPickerCard, panelSettingsCard,
  panelSelectsCard, dutyTeamCard, dutyRankCard, dutyControlCard, dutySelectCard, dutyConfirmCard, noticeCard, statsCard, privateCard, base, text, noMentions,
  profileCard, careerSettingsCard, careerWizardCard, careerHistoryCard,
} = require('./ui');
const { makeModal, editModal, readFields, rankModal, careerReasonModal } = require('./modals');
const { readRpImage, imageAttachment } = require('./uploads');
const duty = require('./duty');
const ops = require('./operations');
const career = require('./career');
const { syncGuildCommands } = require('./sync-commands');
const { quickPanelType } = require('./panel-routing');

const token = process.env.DISCORD_TOKEN;
if (!token || token === 'COLE_SEU_TOKEN_AQUI') {
  console.error('❌ Adicione DISCORD_TOKEN no .env antes de iniciar.');
  process.exit(1);
}
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const recent = new Map();
const busyApplications = new Set();
const busyDuty = new Set();
const busyCareer = new Set();
const careerSessions = new Map();
function cooldown(key, milliseconds = 15_000) {
  const now = Date.now();
  if (now - (recent.get(key) || 0) < milliseconds) return true;
  recent.set(key, now);
  if (recent.size > 5000) for (const [k, t] of recent) if (now - t > 90_000) recent.delete(k);
  return false;
}
function permission(roleId, member) { return !!roleId && member.roles.cache.has(roleId); }
async function getMember(i) { return i.guild.members.fetch(i.user.id); }
async function isAdmin(i) { return (await getMember(i)).permissions.has(PermissionFlagsBits.ManageGuild); }
async function isStaff(i, module, type = null) {
  if (await isAdmin(i)) return true;
  const member = await getMember(i);
  const cfg = guildData(i.guildId).modules[module].roles;
  if (permission(cfg.lider, member) || (type && permission(panelSettings(guildData(i.guildId), module, type).roles.lider, member))) return true;
  const specific = type && panelSettings(guildData(i.guildId), module, type).roles.avaliador;
  // Se um avaliador foi definido no painel, restringe as decisões a ele e à liderança.
  if (specific) return permission(specific, member);
  return permission(cfg.equipe, member);
}
async function isLeader(i,module) {
  if (await isAdmin(i)) return true;
  const g=guildData(i.guildId);
  const member=await getMember(i);
  return permission(g.modules[module].roles.lider,member)||permission(panelSettings(g,module,'plantao').roles.lider,member);
}
async function isMember(i, module) {
  if (await isStaff(i, module)) return true;
  const role = guildData(i.guildId).modules[module].roles.membro;
  return permission(role, await getMember(i));
}
async function permitted(i, module, type) {
  if (await isAdmin(i)) return true;
  const role = panelSettings(guildData(i.guildId), module, type).roles.acesso;
  return !role || permission(role, await getMember(i));
}
async function deny(i, message) {
  const messagePayload = { content: `❌ ${message}`, flags: MessageFlags.Ephemeral, allowedMentions: noMentions };
  if (i.deferred || i.replied) return i.followUp(messagePayload);
  return i.reply(messagePayload);
}
function assertModule(module) { if (!MODULES[module]) throw new Error('Módulo inválido'); }
function assertPanel(type) { if (!TYPES[type]) throw new Error('Painel inválido'); }
async function fetchOutput(guild, id, kind = 'texto') {
  if (!id) throw new Error(`Configure o canal ${kind} primeiro usando /config.`);
  const channel = await guild.channels.fetch(id);
  if (!channel || channel.type !== ChannelType.GuildText || typeof channel.send !== 'function') throw new Error(`Canal de ${kind} não encontrado ou não é de texto.`);
  return channel;
}
function isPrivate(channel, guild) {
  const permissions = channel.permissionsFor(guild.roles.everyone);
  return !!permissions && !permissions.has(PermissionFlagsBits.ViewChannel);
}
function mustBePrivate(channel, guild, purpose) {
  if (!isPrivate(channel, guild)) throw new Error(`O canal de ${purpose} precisa ser PRIVADO para a equipe (sem acesso @everyone). Ajuste as permissões antes de coletar fichas.`);
}
async function log(i, module, type, heading, detail, photo = null, id = null) {
  try {
    const g = guildData(i.guildId);
    if (!panelSettings(g, module, type).logging) return;
    const logId = effectiveChannel(g, module, type, 'logs');
    if (!logId) return;
    const channel = await fetchOutput(i.guild, logId, 'logs');
    mustBePrivate(channel, i.guild, 'logs');
    const file = photo ? imageAttachment(photo, id || 'rp') : null;
    await channel.send({ ...noticeCard(module, heading, detail, file?.name || null), ...(file ? { files: [file] } : {}) });
  } catch (error) { console.error('Falha ao registrar log:', error.message); }
}
async function dm(userId, message) {
  try { await (await client.users.fetch(userId)).send({ content: message, allowedMentions: noMentions }); }
  catch { /* DMs desativadas não interrompem ação principal. */ }
}
function ensureConfig(c, key) { if (!c.channels[key]) throw new Error(`Configure o canal ${key} em /config → Canais gerais.`); }
function targetType(action) { return ['recrutamento','registro','whitelist','rg','punicoes','ausencias'].includes(action) ? action : action==='ponto'?'plantao':action==='ranking'?'ranking':'suporte'; }
async function updateConfigMessage(i, data) {
  const { flags: ignored, ...update } = data;
  return i.update(update);
}
async function refreshPanel(guild, module, type) {
  const g = guildData(guild.id);
  const info = g.modules[module].panels[type];
  if (!info) return false;
  const channel = await fetchOutput(guild, info.channelId, 'painel');
  const message = await channel.messages.fetch(info.messageId);
  // Repõe explicitamente o GIF para evitar referência quebrada ao editar mensagem.
  const next = panel(g, module, type);
  await message.edit({...next,attachments:[]});
  return true;
}
async function refreshDutyPanels(guild, module) {
  for (const kind of ['plantao', 'status', 'ranking', 'gestao']) {
    try { await refreshPanel(guild, module, kind); }
    catch (err) { console.error(`Falha ao atualizar painel ${kind}:`, err.message); }
  }
}

// Sessão temporária para os assistentes de promoções e rebaixamentos. Não guarda tokens.
function careerSessionKey(i,module){return `${i.guildId}:${i.user.id}:${module}`;}
function getCareerSession(i,module,mode){
  const session=careerSessions.get(careerSessionKey(i,module));
  if(!session||session.mode!==mode||Date.now()-session.startedAt>15*60_000){
    careerSessions.delete(careerSessionKey(i,module));
    throw new Error('Sessão expirada. Abra Promoção/Rebaixamento novamente no painel Gestão.');
  }
  return session;
}
async function onCareerButton(i,action,module,mode){
  assertModule(module);const g=guildData(i.guildId);
  if(action==='history'){
    if(!(await isStaff(i,module,'gestao')))return deny(i,'Histórico disponível somente para a equipe.');
    return i.reply(careerHistoryCard(g,module));
  }
  if(action==='settings'){
    if(!(await isAdmin(i)))return deny(i,'Somente administradores podem configurar canais e tags da gestão.');
    return i.reply(careerSettingsCard(g,module));
  }
  if(!(await isLeader(i,module)))return deny(i,'Somente liderança e administração podem promover ou rebaixar integrantes.');
  if(action==='start'){
    if(!['promocao','rebaixamento'].includes(mode))return deny(i,'Tipo de mudança inválido.');
    careerSessions.set(careerSessionKey(i,module),{mode,startedAt:Date.now(),targetId:null,addRoles:[],removeRoles:[],reason:''});
    return i.reply(careerWizardCard(module,getCareerSession(i,module,mode)));
  }
  if(!['promocao','rebaixamento'].includes(mode))return deny(i,'Ação inválida.');
  const session=getCareerSession(i,module,mode);
  if(action==='abort'){
    careerSessions.delete(careerSessionKey(i,module));
    return i.update({components:[base(module).addTextDisplayComponents(text('✅ Operação cancelada. Nenhum cargo foi alterado.'))],allowedMentions:noMentions});
  }
  if(action==='reason')return i.showModal(careerReasonModal(module,mode,session.reason));
  if(action!=='confirm')return deny(i,'Ação administrativa desconhecida.');
  const plan=career.planMovement(session);
  const cfg=g.modules[module];const publishId=cfg.channels[mode==='promocao'?'promocoes':'rebaixamentos'];
  if(!publishId)return deny(i,'Configure o canal de publicações em Gestão → Configurar canais.');
  const allow=cfg.careerAllowedRoleIds||[];
  if(!allow.length)return deny(i,'Configure as tags autorizadas a mudar em Gestão → Configurar canais.');
  const desired=[...plan.addRoles,...plan.removeRoles];
  if(desired.some(id=>!allow.includes(id)))return deny(i,'A seleção possui cargos não autorizados pela configuração da gestão.');
  const pub=await fetchOutput(i.guild,publishId,mode==='promocao'?'promoções':'rebaixamentos');
  const bot=await i.guild.members.fetchMe();const actor=await getMember(i);
  if(!bot.permissions.has(PermissionFlagsBits.ManageRoles))return deny(i,'O bot precisa da permissão Gerenciar Cargos.');
  const target=await i.guild.members.fetch(plan.targetId);
  if(target.id===i.guild.ownerId||target.id===client.user.id)return deny(i,'Não é permitido alterar cargos do dono do servidor ou do próprio bot.');
  if(target.roles.highest.comparePositionTo(bot.roles.highest)>=0)return deny(i,'O integrante tem cargo acima ou igual ao do bot.');
  if(i.user.id!==i.guild.ownerId&&target.roles.highest.comparePositionTo(actor.roles.highest)>=0)
    return deny(i,'Você não pode alterar um integrante com cargo igual ou superior ao seu.');
  for(const id of desired){
    const role=await i.guild.roles.fetch(id);
    if(!role||role.id===i.guild.id||role.managed)return deny(i,'Seleção contém cargo inválido, @everyone ou gerenciado por integração.');
    if(bot.roles.highest.comparePositionTo(role)<=0)return deny(i,`O cargo ${role.name} é igual ou superior ao cargo do bot.`);
    if(i.user.id!==i.guild.ownerId&&actor.roles.highest.comparePositionTo(role)<=0)return deny(i,`Seu cargo precisa estar acima de ${role.name}.`);
    if(role.permissions.has(PermissionFlagsBits.Administrator)||role.permissions.has(PermissionFlagsBits.ManageGuild)||role.permissions.has(PermissionFlagsBits.ManageRoles))
      return deny(i,'Não é permitido alterar cargos com permissões administrativas neste painel.');
  }
  const rolesToRemove=plan.removeRoles.filter(id=>target.roles.cache.has(id));
  const rolesToAdd=plan.addRoles.filter(id=>!target.roles.cache.has(id));
  if(!rolesToRemove.length&&!rolesToAdd.length)return deny(i,'O integrante já possui exatamente os cargos selecionados.');
  const busyKey=`${i.guildId}:${module}:${plan.targetId}`;
  if(busyCareer.has(busyKey))return deny(i,'Já existe uma movimentação em andamento para este integrante.');
  busyCareer.add(busyKey);
  try{
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(rolesToRemove.length)await target.roles.remove(rolesToRemove,`CETUS RP ${mode} por ${i.user.id}`);
    try{if(rolesToAdd.length)await target.roles.add(rolesToAdd,`CETUS RP ${mode} por ${i.user.id}`);}
    catch(err){
      if(rolesToRemove.length)await target.roles.add(rolesToRemove,'Reversão de troca de cargos incompleta').catch(e=>console.error('Falha na reversão:',e));
      throw err;
    }
    const id=nextId(i.guildId,mode==='promocao'?'PRO':'REB');
    const record=career.saveMovement(g,{id,module,mode,targetId:target.id,actorId:i.user.id,addRoles:rolesToAdd,removeRoles:rolesToRemove,reason:plan.reason,createdAt:Date.now()});
    ops.audit(g,module,mode,i.user.id,target.id);save();
    careerSessions.delete(careerSessionKey(i,module));
    const display=mode==='promocao'?'⬆️ PROMOÇÃO':'⬇️ REBAIXAMENTO';
    const list=ids=>ids.length?ids.map(id=>`<@&${id}>`).join(' · '):'Nenhum';
    const msg=`🧾 Protocolo: ${id}\n👤 Integrante: <@${target.id}>\n👑 Responsável: <@${i.user.id}>\n➕ Adicionados: ${list(record.addRoles)}\n➖ Removidos: ${list(record.removeRoles)}\n📝 Motivo: ${plan.reason}`;
    let publishError=null;
    try{await pub.send(noticeCard(module,display,msg));}catch(err){publishError=err;console.error('Falha publicação de mudança:',err);}
    await log(i,module,'gestao',display,msg);
    await dm(target.id,`CETUS RP | ${MODULES[module].title}\n${display} (${id})\nMotivo RP: ${plan.reason}`);
    return i.editReply({content:`✅ ${display} realizada. Protocolo **${id}**. ${publishError?'⚠️ Os cargos foram alterados e salvos, mas a publicação falhou; confira as permissões do canal.':'📢 Publicada no canal configurado.'}`,allowedMentions:noMentions});
  }finally{busyCareer.delete(busyKey);}
}
async function onCareerSelect(i){
 const [,field,module,mode]=i.customId.split(':');assertModule(module);
 if(!(await isLeader(i,module)))return deny(i,'Somente liderança pode editar as movimentações RP.');
 const session=getCareerSession(i,module,mode);
 if(field==='target')session.targetId=i.values[0];
 else if(field==='add')session.addRoles=career.normalizedRoleList(i.values);
 else if(field==='remove')session.removeRoles=career.normalizedRoleList(i.values);
 else return deny(i,'Seleção desconhecida.');
 const {flags:unused,...update}=careerWizardCard(module,session);
 return i.update(update);
}
async function onCareerReason(i,module,mode){
 assertModule(module);
 if(!(await isLeader(i,module)))return deny(i,'Apenas a liderança pode definir o motivo.');
 const session=getCareerSession(i,module,mode);
 const reason=i.fields.getTextInputValue('motivo').trim();
 if(reason.length<5||reason.length>400)return deny(i,'O motivo precisa ter de 5 a 400 caracteres.');
 session.reason=reason;
 const {flags:unused,...update}=careerWizardCard(module,session);
 // Modal aberto a partir de uma mensagem interativa; atualiza essa mensagem privada.
 return i.update(update);
}
async function onCareerChannel(i){
 const [,module,key]=i.customId.split(':');assertModule(module);
 if(!(await isAdmin(i)))return deny(i,'Somente administradores configuram canais da gestão.');
 if(!['promocoes','rebaixamentos','advertencias'].includes(key))return deny(i,'Canal de gestão inválido.');
 const id=i.values[0]||null;
 if(id){const ch=await fetchOutput(i.guild,id,key);if(key==='advertencias')mustBePrivate(ch,i.guild,'advertências');}
 const g=guildData(i.guildId);g.modules[module].channels[key]=id;save();
 const {flags:unused,...payload}=careerSettingsCard(g,module);
 await i.update(payload);
 await log(i,module,'gestao','Canal de gestão alterado',`Responsável: <@${i.user.id}>\nTipo: ${key}\nCanal: ${id?`<#${id}>`:'Removido'}`);
}
async function onCareerRoles(i){
 const [,module]=i.customId.split(':');assertModule(module);
 if(!(await isAdmin(i)))return deny(i,'Somente administradores escolhem os cargos autorizados.');
 const ids=[...new Set(i.values)];
 if(ids.length>25||ids.some(id=>!/^\d{17,20}$/.test(id)))return deny(i,'Selecione até 25 cargos válidos.');
 for(const id of ids){const role=await i.guild.roles.fetch(id);if(!role||role.managed||role.id===i.guild.id||role.permissions.has(PermissionFlagsBits.Administrator)||role.permissions.has(PermissionFlagsBits.ManageGuild)||role.permissions.has(PermissionFlagsBits.ManageRoles))return deny(i,'Não permita cargos administrativos ou gerenciados por integrações.');}
 const g=guildData(i.guildId);g.modules[module].careerAllowedRoleIds=ids;save();
 const {flags:unused,...payload}=careerSettingsCard(g,module);
 return i.update(payload);
}

async function onCommand(i) {
  const command = i.commandName;
  const g = guildData(i.guildId);
  if (command === 'config') {
    if (!(await isAdmin(i))) return deny(i, 'Somente quem gerencia o servidor pode alterar a configuração.');
    const module = i.options.getString('modulo', true);
    assertModule(module);
    return i.reply(settingsCard(g, module));
  }
  const quickType = quickPanelType(command);
  if (command === 'painel' || quickType) {
    if (!(await isAdmin(i))) return deny(i, 'Permissão de gerenciar servidor necessária.');
    const module = i.options.getString('modulo', true);
    const type = quickType || i.options.getString('tipo', true);
    const channel = i.options.getChannel('canal', command === 'painel') || i.channel;
    assertModule(module); assertPanel(type);
    if (channel.type !== ChannelType.GuildText) return deny(i, 'Escolha um canal de texto.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await channel.send(panel(g, module, type));
    g.modules[module].panels[type] = { channelId: channel.id, messageId: message.id };
    save();
    await log(i, module, type, 'Painel publicado', `Painel: ${TYPES[type].label}\nPor: <@${i.user.id}>\nCanal: <#${channel.id}>`);
    return i.editReply({ content: `✅ Painel **${TYPES[type].label}** da **${MODULES[module].title}** publicado em <#${channel.id}>.`, allowedMentions: noMentions });
  }
  return deny(i, 'Comando não reconhecido. Atualize os comandos do aplicativo.');
}

async function onButton(i) {
  const [section, action, moduleOrId, type, extra] = i.customId.split(':');
  if (section === 'profile') {
    const module=moduleOrId;assertModule(module);
    if (!(await permitted(i,module,'historico'))) return deny(i,'Você não tem acesso ao histórico RP.');
    if(!['mine','points'].includes(action))return deny(i,'Ação de perfil inválida.');
    return i.reply(profileCard(guildData(i.guildId),module,i.user.id,action==='points'?'points':'summary'));
  }
  if (section === 'career') return onCareerButton(i,action,moduleOrId,type);
  if (section === 'open') {
    const module = moduleOrId;
    assertModule(module);
    const sourceType = TYPES[type] ? type : targetType(action);
    const actualType = targetType(action);
    if (!(await permitted(i, module, sourceType)) || !(await permitted(i, module, actualType))) return deny(i, 'Você não possui o cargo autorizado a utilizar esse painel.');
    if (['recrutamento', 'registro','whitelist','rg','punicoes','ticket', 'relatorio','ausencias'].includes(action)) {
      if (action==='punicoes' && !(await isStaff(i,module,'punicoes'))) return deny(i,'Apenas a equipe pode registrar advertências RP.');
      if (cooldown(`modal:${i.guildId}:${i.user.id}:${action}`, 8_000)) return deny(i, 'Aguarde alguns segundos antes de abrir outro formulário.');
      return i.showModal(makeModal(action, module, sourceType));
    }
    if (action === 'ponto') return i.reply(dutyControlCard(guildData(i.guildId), module));
    if (action === 'ranking') return i.reply(dutyRankCard(guildData(i.guildId), module));
    return deny(i, 'Opção não encontrada.');
  }
  if (section === 'staff') {
    const module = moduleOrId;
    assertModule(module);
    if (!(await isStaff(i, module))) return deny(i, 'Esta função é exclusiva da equipe e da liderança.');
    if (action === 'stats') return i.reply(statsCard(module, guildData(i.guildId)));
    if (action === 'announce') return i.showModal(makeModal('anuncio', module, 'central'));
    return deny(i, 'Ação administrativa inválida.');
  }
  if (section === 'panelcfg') {
    const module=moduleOrId; assertModule(module); assertPanel(type);
    if (!(await isAdmin(i))) return deny(i,'A configuração do painel é exclusiva da administração.');
    return i.reply(panelSettingsCard(guildData(i.guildId),module,type));
  }
  if (section === 'edit') {
    const module = moduleOrId;
    assertModule(module);
    if (!(await isAdmin(i))) return deny(i, 'Somente administradores podem editar painéis.');
    if (!['title', 'description','ptitle','pdesc','pgif'].includes(action)) return deny(i, 'Campo inválido.');
    if (action.startsWith('p')) {assertPanel(type);const c=panelSettings(guildData(i.guildId),module,type);const field=action==='ptitle'?'title':action==='pdesc'?'description':'bannerUrl';return i.showModal(editModal(action,module,c[field]||'',type));}
    return i.showModal(editModal(action, module, guildData(i.guildId).modules[module][action]));
  }
  if (section === 'config') {
    const module = moduleOrId;
    assertModule(module);
    if (!(await isAdmin(i))) return deny(i, 'Somente administradores configuram os painéis.');
    const g = guildData(i.guildId);
    if (action === 'overview') return updateConfigMessage(i, settingsCard(g, module));
    if (action === 'menu') return updateConfigMessage(i, panelPickerCard(module));
    if (action === 'globalroles') return updateConfigMessage(i, globalSettingsCard(g, module, 'roles'));
    if (action === 'globalchannels') return updateConfigMessage(i, globalSettingsCard(g, module, 'channels'));
    if (action === 'ranklimits') return i.showModal(rankModal(module,g.modules[module].rankThresholds));
    assertPanel(type);
    if (action === 'detail') return updateConfigMessage(i, panelSettingsCard(g, module, type));
    if (['roles', 'channels'].includes(action)) return updateConfigMessage(i, panelSelectsCard(g, module, type, action));
    if (action === 'toggle') {
      panelSettings(g, module, type).logging = !panelSettings(g, module, type).logging;
      save();
      await updateConfigMessage(i, panelSettingsCard(g, module, type));
      await log(i, module, 'central', 'Configuração de logs', `Admin: <@${i.user.id}>\nPainel: ${TYPES[type].label}\nLogs: ${panelSettings(g, module, type).logging ? 'ligados' : 'desligados'}`);
      return;
    }
    if (action === 'refresh') {
      await updateConfigMessage(i, panelSettingsCard(g, module, type));
      try { const updated = await refreshPanel(i.guild, module, type); return i.followUp({ content: updated ? '✅ Painel atualizado no canal original.' : 'ℹ️ Publique este painel primeiro usando /painel.', flags: MessageFlags.Ephemeral }); }
      catch (error) { return i.followUp({ content: `❌ Falha ao atualizar painel: ${error.message}`, flags: MessageFlags.Ephemeral }); }
    }
  }
  if (section === 'review') return onReview(i, action, moduleOrId);
  if (section === 'ticket' && action === 'close') return closeTicket(i, moduleOrId);
  if (section === 'duty') return onDuty(i, action, moduleOrId, type, extra);
}

async function onSelect(i) {
  if (i.customId.startsWith('dutyselect:')) return onDutySelect(i);
  if (i.customId.startsWith('careerselect:')) return onCareerSelect(i);
  if (i.customId.startsWith('careerchannel:')) return onCareerChannel(i);
  if (i.customId.startsWith('careerroles:')) return onCareerRoles(i);
  if (!(await isAdmin(i))) return deny(i, 'Somente administradores configuram os painéis.');
  const [section, module, type, key] = i.customId.split(':');
  const g = guildData(i.guildId);
  if (section === 'pick' && module === 'panel') { // id pick:panel:<module>
    const chosenModule = type;
    assertModule(chosenModule);
    const selected = i.values[0]; assertPanel(selected);
    return updateConfigMessage(i, panelSettingsCard(g, chosenModule, selected));
  }
  assertModule(module);
  if (section === 'globalrole') {
    if (!['membro','equipe','lider','em_servico','rank1','rank2','rank3'].includes(type)) return deny(i, 'Campo de cargo inválido.');
    const roleId=i.values[0]||null;
    if (roleId) {
      const role=await i.guild.roles.fetch(roleId);
      if (!role||role.managed) return deny(i, 'Escolha um cargo normal do servidor.');
      if (['membro','em_servico','rank1','rank2','rank3'].includes(type) && i.guild.members.me?.roles.highest.comparePositionTo(role)<=0) return deny(i, 'O cargo do bot deve estar acima do selecionado.');
    }
    g.modules[module].roles[type]=roleId;
    save();
    await updateConfigMessage(i,globalSettingsCard(g,module,'roles'));
    await log(i,module,'central','Cargo geral atualizado',`Admin: <@${i.user.id}>\nCampo: ${type}\nCargo: ${roleId?`<@&${roleId}>`:'Removido'}`);
    return;
  }
  if (section === 'globalchannel') {
    if (!['analises','logs','anuncios','categoria_tickets'].includes(type)) return deny(i,'Campo de canal inválido.');
    const channelId=i.values[0]||null;
    if(channelId){
      const channel=await i.guild.channels.fetch(channelId);
      if(!channel || channel.type !== (type==='categoria_tickets'?ChannelType.GuildCategory:ChannelType.GuildText))return deny(i,'Selecione um canal ou categoria do tipo correto.');
      if(['analises','logs'].includes(type))mustBePrivate(channel,i.guild,type);
    }
    g.modules[module].channels[type]=channelId;
    save();
    await updateConfigMessage(i,globalSettingsCard(g,module,'channels'));
    await log(i,module,'central','Canal geral atualizado',`Admin: <@${i.user.id}>\nCampo: ${type}\nCanal: ${channelId?`<#${channelId}>`:'Removido'}`);
    return;
  }
  assertPanel(type);
  if (section === 'selrole') {
    if (!PANEL_ROLES[key]) return deny(i, 'Configuração inválida.');
    const roleId = i.values[0] || null;
    if (roleId) {
      const role = await i.guild.roles.fetch(roleId);
      if (!role || role.managed) return deny(i, 'Selecione um cargo que não seja controlado por integração.');
      if (['aprovado','servico','rank1','rank2','rank3'].includes(key) && i.guild.members.me && i.guild.members.me.roles.highest.comparePositionTo(role) <= 0) return deny(i, 'O cargo do bot deve ficar acima do cargo selecionado.');
    }
    panelSettings(g, module, type).roles[key] = roleId;
    save();
    await updateConfigMessage(i, panelSelectsCard(g, module, type, 'roles'));
    await log(i, module, type, 'Configuração de cargo', `Admin: <@${i.user.id}>\nPainel: ${TYPES[type].label}\nCampo: ${key}\nCargo: ${roleId ? `<@&${roleId}>` : 'Padrão'}`);
    return;
  }
  if (section === 'selchannel') {
    if (!PANEL_CHANNELS[key]) return deny(i, 'Configuração inválida.');
    const channelId = i.values[0] || null;
    if (channelId) { const channel = await fetchOutput(i.guild, channelId, key); mustBePrivate(channel, i.guild, key); }
    panelSettings(g, module, type).channels[key] = channelId;
    save();
    await updateConfigMessage(i, panelSelectsCard(g, module, type, 'channels'));
    await log(i, module, type, 'Configuração de canal', `Admin: <@${i.user.id}>\nPainel: ${TYPES[type].label}\nCampo: ${key}\nCanal: ${channelId ? `<#${channelId}>` : 'Padrão'}`);
    return;
  }
}

async function onModal(i) {
  const [section, kind, module, sourceType] = i.customId.split(':');
  if(section==='careerreason')return onCareerReason(i,kind,module);
  assertModule(module);
  if (section === 'savecfg') {
    if (!(await isAdmin(i))) return deny(i, 'Sem permissão para configurar o painel.');
    if(kind==='ranklimits'){
      const thresholds=['level1','level2','level3'].map(key=>Number(i.fields.getTextInputValue(key)));
      if(thresholds.some(x=>!Number.isInteger(x)||x<1||x>100000)||!(thresholds[0]<thresholds[1]&&thresholds[1]<thresholds[2]))return deny(i,'Informe 3 metas inteiras de minutos, positivas e crescentes.');
      const g=guildData(i.guildId);g.modules[module].rankThresholds=thresholds;
      ops.audit(g,module,'metas_rank',i.user.id,thresholds.join(','));save();
      return i.reply({content:`✅ Metas de rank atualizadas: ${thresholds.map(x=>`${x} min`).join(' • ')}. Os cargos serão sincronizados no próximo evento de ponto.`,flags:MessageFlags.Ephemeral});
    }
    if (!['title', 'description','ptitle','pdesc','pgif'].includes(kind)) return deny(i,'Campo inválido.');
    let changedType='central';
    if (kind.startsWith('p')) {
      assertPanel(sourceType);changedType=sourceType;
      const value=i.fields.getTextInputValue('valor').trim();
      if(kind==='pgif') {
        if(value.toLowerCase()!=='padrao') {
          let url;try{url=new URL(value);}catch{return deny(i,'Insira um link HTTPS direto para um GIF ou a palavra padrao.');}
          if(url.protocol!=='https:' || !url.pathname.toLowerCase().endsWith('.gif'))return deny(i,'O banner precisa ser um endereço HTTPS direto para arquivo .gif, ou use padrao.');
        }
        panelSettings(guildData(i.guildId),module,sourceType).bannerUrl=value.toLowerCase()==='padrao'?null:value;
      } else panelSettings(guildData(i.guildId),module,sourceType)[kind==='ptitle'?'title':'description']=value;
    } else guildData(i.guildId).modules[module][kind]=i.fields.getTextInputValue('valor');
    save();
    await i.reply({content:'✅ Texto atualizado. Para publicar a alteração, clique em **Aplicar no painel** nas configurações.',flags:MessageFlags.Ephemeral});
    await log(i,module,changedType,'Texto alterado',`Admin: <@${i.user.id}>\nCampo: ${kind}`);
    return;
  }
  if (section !== 'submit') return;
  if (kind === 'anuncio') {
    if (!(await isStaff(i,module))) return deny(i,'Apenas a equipe ou liderança pode publicar comunicados.');
    if(cooldown(`anuncio:${i.guildId}:${i.user.id}`,12_000))return deny(i,'Aguarde um pouco antes de publicar outro anúncio.');
    const textValue=readFields(i,'anuncio').Texto;
    const cfg=guildData(i.guildId).modules[module];
    ensureConfig(cfg,'anuncios');
    const channel=await fetchOutput(i.guild,cfg.channels.anuncios,'anúncios');
    await i.deferReply({flags:MessageFlags.Ephemeral});
    await channel.send(noticeCard(module,'📢 Comunicado RP',textValue));
    await log(i,module,'central','Anúncio publicado',`Responsável: <@${i.user.id}>\nCanal: <#${channel.id}>`);
    return i.editReply({content:'✅ Anúncio enviado pelo painel.'});
  }
  const type = targetType(kind);
  if (!(await permitted(i, module, type)) || (TYPES[sourceType] && !(await permitted(i, module, sourceType)))) return deny(i, 'Você não tem mais acesso a este formulário.');
  if (cooldown(`submit:${i.guildId}:${i.user.id}:${kind}`, 25_000)) return deny(i, 'Você enviou um formulário recentemente. Aguarde um pouco.');
  const fields = readFields(i, kind);
  if (kind === 'ticket') return createTicket(i, module, fields);
  if (kind==='punicoes') return createWarning(i,module,fields);
  if (['recrutamento', 'registro', 'whitelist','rg','relatorio','ausencias'].includes(kind)) {
    const photo = ['recrutamento','registro','whitelist','rg'].includes(kind) ? i.fields.getUploadedFiles('rg_rp')?.first() : null;
    return createApplication(i, module, kind, fields, photo);
  }
}

async function createApplication(i, module, type, fields, attachment) {
  const busyKey = `${i.guildId}:${module}:${type}:${i.user.id}`;
  if (busyApplications.has(busyKey)) return deny(i, 'Sua ficha já está sendo enviada.');
  busyApplications.add(busyKey);
  try {
  const g = guildData(i.guildId);
  const cfg = g.modules[module];
  const target = type === 'relatorio' ? 'suporte' : type;
  if(type==='ausencias')ops.validateAbsence(fields);
  const analysisId = effectiveChannel(g, module, target, 'analises');
  if (!analysisId) return deny(i, 'O canal de análises não foi configurado. Peça à equipe para configurá-lo.');
  if (type !== 'relatorio') {
    const exists = Object.values(g.applications).some(r => r.module === module && r.userId === i.user.id && r.type === type && r.status === 'pendente');
    if (exists) return deny(i, 'Você já possui uma solicitação deste tipo aguardando análise.');
  }
  const channel = await fetchOutput(i.guild, analysisId, 'análises');
  mustBePrivate(channel, i.guild, 'análises');
  if (attachment) {
    const logsId = effectiveChannel(g, module, target, 'logs');
    if (panelSettings(g, module, target).logging && logsId) {
      const logChannel = await fetchOutput(i.guild, logsId, 'logs');
      mustBePrivate(logChannel, i.guild, 'logs');
    }
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  // Recebe apenas uma imagem fictícia; não salva dados reais nem arquivos no disco.
  const photo = await readRpImage(attachment);
  const prefixes={recrutamento:'REC',registro:'REG',whitelist:'WL',rg:'RGP',relatorio:'REL',ausencias:'AUS'};
  const id = nextId(i.guildId, prefixes[type]||'SOL');
  const record = { id, userId: i.user.id, module, type, fields, status: 'pendente', createdAt: Date.now() };
  if (photo) record.photoExtension = photo.extension;
  const posted = await channel.send({ ...reviewCard(record, false, !!photo), ...(photo ? { files: [imageAttachment(photo, id)] } : {}) });
  record.channelId = channel.id;
  record.messageId = posted.id;
  if (photo) record.photoUrl = posted.attachments.first()?.url || null;
  g.applications[id] = record;
  save();
  await log(i, module, target, `Nova ficha ${id}`, `Tipo: ${type}\nEnviado por <@${i.user.id}>\nCanal privado de análise: <#${channel.id}>\nFoto do RG fictício: ${photo ? 'anexada' : 'não enviada'}`, photo, id);
  return i.editReply({ content: `✅ Solicitação enviada! **Protocolo ${id}**.${photo ? ' Foto do RG fictício anexada à ficha e aos logs configurados.' : ''} A equipe avaliará no canal privado.`, allowedMentions: noMentions });
  } finally { busyApplications.delete(busyKey); }
}
async function onReview(i, action, recordId) {
  const g = guildData(i.guildId);
  const r = g.applications[recordId];
  if (!r) return deny(i, 'Solicitação não encontrada.');
  const type = r.type === 'relatorio' ? 'suporte' : r.type;
  if (!(await isStaff(i, r.module, type))) return deny(i, 'Somente os avaliadores ou líderes deste painel podem decidir.');
  if (r.messageId !== i.message.id || r.channelId !== i.channelId) return deny(i, 'Este botão não corresponde à ficha original.');
  if (r.status !== 'pendente') return deny(i, 'Esta solicitação já foi analisada.');
  if (!['approve', 'reject'].includes(action)) return deny(i, 'Decisão inválida.');
  r.status = 'processando';
  save();
  try {
    await i.deferUpdate();
    if (action === 'approve' && ['recrutamento', 'registro','whitelist','rg'].includes(r.type)) {
      const roleId = effectiveRole(g, r.module, type, 'aprovado');
      if (!roleId && r.type!=='rg') throw new Error('Configure o cargo de aprovado em /config → Cargos gerais ou nas configurações do painel.');
      if (roleId) {const member = await i.guild.members.fetch(r.userId);
      await member.roles.add(roleId, `RP: aprovação ${r.id} por ${i.user.id}`);}
    }
  } catch (error) {
    r.status = 'pendente';
    save();
    if (!i.deferred) return deny(i, `Não foi possível avaliar: ${String(error.message).slice(0, 400)}`);
    return i.followUp({ content: `❌ Falha ao avaliar: ${String(error.message).slice(0, 480)}`, flags: MessageFlags.Ephemeral });
  }
  r.status = action === 'approve' ? 'aprovado' : 'reprovado';
  r.resolvedBy = i.user.id;
  r.resolvedAt = Date.now();
  save();
  let warning = '';
  try { await i.message.edit(reviewCard(r, true)); }
  catch (error) { warning = ' A decisão foi salva, mas a mensagem não pôde ser atualizada.'; console.error(error); }
  await log(i, r.module, type, `Ficha ${r.status}`, `Protocolo: ${r.id}\nAvaliador: <@${i.user.id}>\nSolicitante: <@${r.userId}>`);
  await dm(r.userId, `**Cetus RP | ${MODULES[r.module].title}**\nSua solicitação **${r.id}** foi **${r.status}**.`);
  return i.followUp({ content: `✅ Ficha ${r.id} ${r.status}.${warning}`, flags: MessageFlags.Ephemeral });
}

async function createTicket(i, module, fields) {
  const g = guildData(i.guildId);
  const c = g.modules[module];
  if (!c.channels.categoria_tickets) return deny(i, 'A categoria de tickets não está configurada.');
  const existing = Object.values(g.tickets).find(t => t.module === module && t.userId === i.user.id && t.status === 'aberto');
  if (existing) return deny(i, `Você já tem o ticket **${existing.id}** aberto: <#${existing.channelId}>`);
  const category = await i.guild.channels.fetch(c.channels.categoria_tickets);
  if (!category || category.type !== ChannelType.GuildCategory) return deny(i, 'A categoria configurada não existe.');
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const id = nextId(i.guildId, 'TKT');
  const overwrites = [
    { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
  ];
  for (const role of [c.roles.equipe, c.roles.lider, effectiveRole(g, module, 'suporte', 'avaliador')]) {
    if (role && !overwrites.some(o => o.id === role)) overwrites.push({ id: role, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const channel = await i.guild.channels.create({ name: `ticket-${id.toLowerCase()}`, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: `Atendimento RP ${id}` });
  const ticket = { id, userId: i.user.id, module, channelId: channel.id, subject: fields.Assunto, detail: fields.Detalhes, status: 'aberto', createdAt: Date.now() };
  try {
    const post = await channel.send(ticketCard(ticket));
    ticket.messageId = post.id;
    g.tickets[id] = ticket;
    save();
  } catch (error) { await channel.delete('Rollback de ticket sem mensagem').catch(() => {}); throw error; }
  await log(i, module, 'suporte', 'Ticket criado', `Ticket: ${id}\nUsuário: <@${i.user.id}>\nCanal: <#${channel.id}>`);
  return i.editReply({ content: `✅ Ticket privado criado: <#${channel.id}> (**${id}**).`, allowedMentions: noMentions });
}

async function closeTicket(i, ticketId) {
  const g = guildData(i.guildId);
  const ticket = g.tickets[ticketId];
  if (!ticket) return deny(i, 'Ticket não encontrado.');
  if (ticket.channelId !== i.channelId || ticket.messageId !== i.message.id) return deny(i, 'Este painel não corresponde ao ticket.');
  if (!(ticket.userId === i.user.id || await isStaff(i, ticket.module, 'suporte'))) return deny(i, 'Somente solicitante ou equipe pode encerrar este ticket.');
  if (ticket.status !== 'aberto') return deny(i, 'Este ticket já foi encerrado.');
  await i.deferUpdate();
  try {
    await i.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false });
    ticket.status = 'fechado'; ticket.closedBy = i.user.id; ticket.closedAt = Date.now();
    save();
    await i.message.edit(ticketCard(ticket));
    await i.channel.setName(`fechado-${ticketId.toLowerCase()}`).catch(() => {});
    await log(i, ticket.module, 'suporte', 'Ticket encerrado', `Ticket: ${ticketId}\nResponsável: <@${i.user.id}>`);
    return i.followUp({ content: '✅ Ticket encerrado. O canal permanece para histórico.', flags: MessageFlags.Ephemeral });
  } catch (error) { return i.followUp({ content: `❌ Falha ao encerrar: ${error.message}`, flags: MessageFlags.Ephemeral }); }
}

async function createWarning(i,module,fields){
  if (!(await isStaff(i,module,'punicoes'))) return deny(i,'Apenas a equipe pode registrar advertências RP.');
  const target=String(fields.Integrante||'').trim();
  if(!/^\d{17,20}$/.test(target))return deny(i,'Informe um ID Discord numérico válido.');
  const g=guildData(i.guildId),channelId=g.modules[module].channels.advertencias;
  if(!channelId)return deny(i,'Configure o canal de advertências no painel Gestão → Configurar canais.');
  const channel=await fetchOutput(i.guild,channelId,'advertências');
  mustBePrivate(channel,i.guild,'advertências');
  await i.deferReply({flags:MessageFlags.Ephemeral});
  await i.guild.members.fetch(target);
  const id=nextId(i.guildId,'ADV');
  const rec={id,module,target,by:i.user.id,fields,createdAt:Date.now()};
  await channel.send(noticeCard(module,'📌 Advertência interna RP',`Protocolo: ${id}\nIntegrante: <@${target}>\nResponsável: <@${i.user.id}>\nMotivo: ${fields['Ocorrência RP']}\nMedida: ${fields['Medida interna']}`));
  g.warnings[id]=rec;ops.audit(g,module,'advertencia',i.user.id,target);save();
  await log(i,module,'punicoes','Advertência RP registrada',`Cartão: ${id}\nIntegrante: <@${target}>\nRegistrado por: <@${i.user.id}>\nMotivo: ${fields['Ocorrência RP']}\nMedida: ${fields['Medida interna']}`);
  return i.editReply({content:`✅ Advertência RP registrada e enviada ao canal configurado. Protocolo **${id}**.`});
}
async function syncRankRoles(i,module,userId){
  const g=guildData(i.guildId),score=duty.ranking(g,module).find(r=>r.userId===userId)?.totalMs||0;
  const tier=duty.rankTier(score,g.modules[module].rankThresholds);
  const roles=effectiveRankRoles(g,module);
  if(!roles.some(Boolean))return;
  const member=await i.guild.members.fetch(userId);
  for(let k=0;k<3;k++){
    if(!roles[k])continue;
    if(k===tier-1 && !member.roles.cache.has(roles[k]))await member.roles.add(roles[k],`Rank RP nível ${tier}`);
    else if(k!==tier-1 && member.roles.cache.has(roles[k]))await member.roles.remove(roles[k],'Atualização do rank RP');
  }
}
async function finishDutyLog(i,module,action,c,actorId){
  const descriptions={start:'Entrada em serviço',end:'Saída de serviço',pause:'Cartão pausado pela liderança',resume:'Cartão retomado pela liderança',cancel:'Cartão cancelado pela liderança'};
  await log(i,module,'plantao',descriptions[action]||'Bate-ponto',`Cartão: \`${c.id}\`\nIntegrante: <@${c.userId}>\nResponsável: <@${actorId}>\nStatus: ${c.status}\nTempo válido: ${duty.formatMs(duty.workedMs(c))}`);
  try{await syncRankRoles(i,module,c.userId);}catch(e){console.error('Falha ao sincronizar rank:',e.message);}
  await refreshDutyPanels(i.guild,module);
}
async function onDutySelect(i){
  const [,action,module]=i.customId.split(':');assertModule(module);
  if (!(await isLeader(i,module)))return deny(i,'Somente liderança/comando pode gerenciar cartões.');
  if(!['pause','resume','cancel'].includes(action))return deny(i,'Ação inválida.');
  const id=i.values[0],g=guildData(i.guildId),c=g.dutyCards[id];
  if(!c || c.module!==module)return deny(i,'Cartão não pertence a essa equipe.');
  if(action==='cancel')return i.reply(dutyConfirmCard(module,id));
  return dutyManage(i,action,module,id);
}
async function dutyManage(i,action,module,id){
  if(!(await isLeader(i,module)))return deny(i,'Somente líderes ou administradores podem gerenciar os cartões da equipe.');
  const g=guildData(i.guildId),c=g.dutyCards[id];
  if(!c || c.module!==module)return deny(i,'Cartão inválido para este módulo.');
  const expected={pause:'active',resume:'paused'};
  if(expected[action] && c.status!==expected[action])return deny(i,'Este cartão mudou de estado; abra o seletor novamente.');
  if(action==='cancel' && c.status==='canceled')return deny(i,'Cartão já cancelado.');
  const busyKey=`${i.guildId}:${module}:${c.userId}`;
  if(busyDuty.has(busyKey))return deny(i,'O cartão já está sendo atualizado.');
  const configuredRole=effectiveRole(g,module,'plantao','servico');
  const assignedRole=duty.serviceRoleFor(c,configuredRole);
  if(!configuredRole && action==='resume')return deny(i,'Configure o cargo Em serviço antes de retomar.');
  busyDuty.add(busyKey);
  try{
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const needsRoleChange=action==='resume'||action==='pause'||(action==='cancel'&&['active','paused'].includes(c.status));
    if(needsRoleChange){
      const member=await i.guild.members.fetch(c.userId);
      if(action==='resume') {
        await member.roles.add(configuredRole,`Retomada do plantão ${id}`);
        c.serviceRoleId=configuredRole;
      } else if(assignedRole && member.roles.cache.has(assignedRole)) {
        await member.roles.remove(assignedRole,`${action} do plantão ${id}`);
      }
    }
    if(action==='pause')duty.pause(g,id,i.user.id);
    else if(action==='resume')duty.resume(g,id,i.user.id);
    else duty.cancel(g,id,i.user.id);
    save();await i.editReply({content:`✅ Cartão **${id}** ${action==='pause'?'pausado':action==='resume'?'retomado':'cancelado'} para <@${c.userId}>.`,allowedMentions:noMentions});
    await finishDutyLog(i,module,action,c,i.user.id);
  }finally{busyDuty.delete(busyKey);}
}
async function onDuty(i,action,module,cardId,pageIndex){
  assertModule(module);
  const g=guildData(i.guildId);
  if(action==='team'){
    if(!(await permitted(i,module,'status')))return deny(i,'Você não tem acesso ao quadro.');
    return i.reply(dutyTeamCard(g,module));
  }
  if(action==='rank')return i.reply(dutyRankCard(g,module));
  if(action==='status'){
    const c=duty.ongoing(g,module,i.user.id);const total=duty.ranking(g,module).find(x=>x.userId===i.user.id)?.totalMs||0;
    return i.reply(privateCard(base(module).addTextDisplayComponents(text(`## ⏱️ Meu cartão de ponto\nStatus: **${c?.status==='active'?'🟢 Em serviço':c?.status==='paused'?'🟠 Pausado':'🔴 Fora de serviço'}**\nCartão atual: \`${c?.id||'nenhum'}\`\nHoras contabilizadas: **${duty.formatMs(total)}**`))));
  }
  if(['pause','resume','cancel'].includes(action)){
    if(!(await isLeader(i,module)))return deny(i,'Somente líderes/comando e administradores têm essa permissão.');
    return i.reply(dutySelectCard(g,module,action));
  }
  if(action==='page'){
    if(!(await isLeader(i,module)))return deny(i,'Apenas a liderança pode navegar pelos cartões.');
    if(!['pause','resume','cancel'].includes(cardId))return deny(i,'Ação inválida.');
    const {flags:unused,...data}=dutySelectCard(g,module,cardId,Number(pageIndex)||0);
    return i.update(data);
  }
  if(action==='abort')return i.reply({content:'Cancelamento interrompido. Nenhuma alteração foi realizada.',flags:MessageFlags.Ephemeral});
  if(action==='confirm')return dutyManage(i,'cancel',module,cardId);
  if(!['start','end'].includes(action))return deny(i,'Ação de ponto desconhecida.');
  if(!(await permitted(i,module,'plantao')))return deny(i,'Sem acesso ao bate-ponto.');
  if(action==='start'&&!(await isMember(i,module)))return deny(i,'Você precisa ser integrante dessa equipe RP.');
  const existing=duty.ongoing(g,module,i.user.id);
  if(action==='start'&&existing)return deny(i,'Você já possui cartão aberto ou pausado.');
  if(action==='end'&&!existing)return deny(i,'Você não possui um cartão aberto.');
  const configuredRole=effectiveRole(g,module,'plantao','servico');
  // É permitido encerrar um cartão antigo mesmo após remover/trocar o cargo na configuração.
  if(action==='start'&&!configuredRole)return deny(i,'Configure o cargo Em serviço na configuração do painel Bate-ponto.');
  const busyKey=`${i.guildId}:${module}:${i.user.id}`;
  if(busyDuty.has(busyKey))return deny(i,'Seu cartão já está em processamento.');
  busyDuty.add(busyKey);
  try{
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const member=await i.guild.members.fetch(i.user.id);
    // Guarda no cartão o cargo que estava configurado quando o ponto foi aberto.
    // Evita deixar cargos antigos presos quando a liderança muda a configuração.
    if(action==='start')await member.roles.add(configuredRole,'Entrada em serviço RP');
    else {
      const assignedRole=duty.serviceRoleFor(existing,configuredRole);
      if(assignedRole&&member.roles.cache.has(assignedRole))await member.roles.remove(assignedRole,'Saída de serviço RP');
    }
    const card=action==='start'?duty.start(g,module,i.user.id,nextId(i.guildId,'PNT'),Date.now(),configuredRole):duty.finish(g,existing.id);
    save();
    await i.editReply({content:`${action==='start'?'🟢 **Entrada registrada**':'🔴 **Saída registrada**'}\nCartão: \`${card.id}\`\nTempo trabalhado: **${duty.formatMs(duty.workedMs(card))}**`,allowedMentions:noMentions});
    await finishDutyLog(i,module,action,card,i.user.id);
  }finally{busyDuty.delete(busyKey);}
}

client.on(Events.ClientReady, async () => {
  console.log(`✅ Cetus RP v4.1 online como ${client.user.tag} | ${client.guilds.cache.size} servidor(es)`);
  // Limpeza de comandos globais antigos é OPTO-IN, para não apagar comandos alheios.
  if (process.env.CLEAR_LEGACY_GLOBAL_COMMANDS === 'true') {
    try {await client.application.commands.set([]);console.log('🧹 Comandos globais antigos removidos deste aplicativo.');}
    catch(e){console.error('Falha na limpeza de comandos globais:',e.message);}
  }
  // Comandos locais ao servidor aparecem rapidamente e são sincronizados em cada servidor.
  // Não exige CLIENT_ID, GUILD_ID nem execução manual do deploy.
  for (const guild of client.guilds.cache.values()) await syncGuildCommands(guild);
});
client.on(Events.GuildCreate, guild => syncGuildCommands(guild));
client.on(Events.Error, error => console.error('❌ Erro no cliente Discord:', error.message));
client.on(Events.Warn, message => console.warn('⚠️ Discord:', message));
client.on(Events.InteractionCreate, async i => {
  if (!i.inGuild()) return;
  try {
    if (i.isChatInputCommand()) return await onCommand(i);
    if (i.isButton()) return await onButton(i);
    if (i.isStringSelectMenu() || i.isRoleSelectMenu() || i.isChannelSelectMenu() || i.isUserSelectMenu()) return await onSelect(i);
    if (i.isModalSubmit()) return await onModal(i);
  } catch (error) {
    console.error(`Erro em interação ${i.customId || i.commandName}:`, error);
    const msg = `❌ ${String(error.message || 'Erro inesperado').slice(0, 480)}`;
    try {
      if (i.deferred && !i.replied && (i.isButton() || i.isMessageComponent())) await i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      else if (i.deferred && !i.replied) await i.editReply({ content: msg });
      else if (i.replied) await i.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      else await i.reply({ content: msg, flags: MessageFlags.Ephemeral });
    } catch (secondary) { console.error('Falha ao responder erro:', secondary.message); }
  }
});
process.on('unhandledRejection', error => console.error('Rejeição não tratada:', error));
process.on('uncaughtException', error => console.error('Exceção não capturada:', error));
client.login(token).catch(error => { console.error('Não foi possível logar:', error.message); process.exitCode = 1; });
