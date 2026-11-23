'use strict';
const logSetup = require('./log-setup');

const path = require('node:path');
const {
  AttachmentBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder,
  MediaGalleryItemBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, StringSelectMenuBuilder, RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');
const core = require('./core');
const {formatDateBR}=require('./date-br');

// Identidade visual única. Todas as mensagens públicas usam Components V2;
// convites no PV são embeds tradicionais, para facilitar o uso no celular.
const COLORS = Object.freeze({
  blue: 0x3b82f6, cyan: 0x06b6d4, green: 0x22c55e,
  amber: 0xf59e0b, red: 0xef4444, purple: 0x8b5cf6,
  slate: 0x64748b
});
const mentions = {parse: []};
const safe = value => String(value ?? '').replaceAll('@', '@\u200b').replaceAll('`', 'ˈ').slice(0, 1500);
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const text = value => new TextDisplayBuilder().setContent(value);
const accent = type => COLORS[type] || COLORS.blue;
const timestamp = value => value ? `<t:${Math.floor(value / 1000)}:f>` : '—';
const shiftLabel = shift => core.SHIFTS[shift] || '🕒 Turno não definido';

function button(id, label, style = ButtonStyle.Secondary, emoji) {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style);
   if(label)b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  return b;
}
function toneOf(title) {
  if (/❌|🔴|CANCEL|REPROV|FALHA/i.test(title)) return 'red';
  if (/⚠️|⏸️|⌛|AGUARD/i.test(title)) return 'amber';
  if (/✅|🟢|CONCLUÍDA/i.test(title)) return 'green';
  if (/⚙️|CONFIGUR|🔎|FISCAL/i.test(title)) return 'purple';
  return 'blue';
}
function v2(title, body = '', rows = [], ephemeral = true, tone = toneOf(title)) {
  const container = new ContainerBuilder().setAccentColor(accent(tone));
  container.addTextDisplayComponents(text(`## ${title}`));
  if (body) container.addTextDisplayComponents(text(String(body).slice(0, 3900)));
  for (const actions of rows) container.addActionRowComponents(actions);
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    allowedMentions: mentions
  };
}
function msg(content) {
  const c = String(content);
  const title = /^✅/.test(c) ? '✅ SOLICITAÇÃO CONCLUÍDA' :
    /^⚠️/.test(c) ? '⚠️ ATENÇÃO' :
    /^❌/.test(c) ? '❌ NÃO FOI POSSÍVEL' : '🔔 CENTRAL DE PONTO';
  return v2(title, c);
}
const asset = 'central-de-ponto.gif';
function panel(p, mode = 'team') {
  const container = new ContainerBuilder().setAccentColor(0x9f67e8);
  const isTeam = mode !== 'individual';
  const configuredTitle = String(p?.title || '').trim();
  const defaultTitle = !configuredTitle || /^(🕒\s*)?CENTRAL DE PONTO$/i.test(configuredTitle) || /^⏱️ Central de Bate-Ponto$/i.test(configuredTitle);
  const heading = defaultTitle ? 'Sistema de Bate-Ponto' : safe(configuredTitle);
  container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(p.customGif || `attachment://${asset}`)
      .setDescription('BATE PONTO • banner animado escuro da Central de Horas')
  ));
  container.addTextDisplayComponents(text(
    `# ${heading}\n`+
    `Controle sua jornada de serviço de forma rápida e segura.\n`+
    `-# ${isTeam ? 'PONTO EM EQUIPE' : 'PONTO INDIVIDUAL'} · HORAS REGISTRADAS POR PESSOA`
  ));
  if (p.description && !/Iniciar \/ Encerrar|Monte a equipe|Gerenciar equipe|Meus pontos|Controle sua jornada/i.test(p.description)) {
    container.addTextDisplayComponents(text(String(p.description).slice(0, 480)));
  }
  container.addTextDisplayComponents(text(
    `### Jornada de serviço\n`+
    `Inicie o ponto ao entrar em serviço, pause nos intervalos e retorne ao continuar. `+
    `O tempo em pausa não é contabilizado. O encerramento exige confirmação.`
  ));
  container.addActionRowComponents(row(
    button('bp:toggle', 'Bater ponto / Encerrar', ButtonStyle.Success, '⏰'),
    button('bp:pause', 'Pausar / Retornar', ButtonStyle.Secondary, '⏯️')
  ));
  container.addActionRowComponents(row(
    button('bp:mine', 'Meu ponto', ButtonStyle.Secondary, '🟢'),
    ...(isTeam ? [button('bp:team', 'Minha equipe', ButtonStyle.Secondary, '👥'),
      button('bp:invites', 'Meus convites', ButtonStyle.Primary, '📨')] : [])
  ));
  container.addActionRowComponents(row(
    button('bp:ranking', '', ButtonStyle.Secondary, '🏆'),
    button('bp:config', '', ButtonStyle.Secondary, '⚙️')
  ));
  container.addTextDisplayComponents(text(`-# CENTRAL DE PONTO • ${isTeam?'Convites de equipe podem ser aceitos neste servidor.':'Modo individual ativo.'} Horas sincronizadas com a Central de Horas.`));
  return {
    components: [container], flags: MessageFlags.IsComponentsV2,
    allowedMentions: mentions,
    ...(p.customGif ? {} : {
      files: [new AttachmentBuilder(path.join(__dirname, '..', 'assets', asset), {name: asset})]
    })
  };
}
const stat = Object.freeze({
  pending: 'Aguardando aceites', active: 'Em serviço',
  paused: 'Em pausa', ended: 'Encerrado',
  canceled: 'Horas canceladas', declined: 'Convite recusado',
  expired: 'Convite expirado'
});
const statusTone = Object.freeze({
  pending: 'amber', active: 'green', paused: 'amber', ended: 'blue',
  canceled: 'red', declined: 'red', expired: 'slate'
});
function memberLine(m, card, now = Date.now()) {
  const who = `<@${m.userId}>`;
  const leader = m.userId === card.leaderId ? ' · Líder' : '';
  const type = 'Horas registradas';
  if (m.invalidation) return `• ${who}${leader} — **Horas invalidadas**\n  ${type}`;
  if (card.status === 'pending') return `• ${who}${leader} — ${m.accepted ? 'Convite aceito' : 'Aguardando aceite'}\n  ${type}`;
  return `• ${who}${leader} — **${core.format(core.durationFor(m, now))}**\n  ${type}`;
}
function cardText(card, now = Date.now()) {
  const totals = core.totalFor(card, now);
  const accepted = card.members.filter(m => m.accepted).length;
  const members = card.members.map(m => memberLine(m, card, now)).join('\n');
  return [
    `**Equipe:** ${safe(card.name)}  ·  **Cartão:** ${safe(card.id)}`,
    `**Status:** ${stat[card.status] || safe(card.status)}`,
    `**Turno:** ${shiftLabel(card.shift)}  ·  **Responsável:** <@${card.leaderId}>`,
    card.status === 'pending' ? `**Convites aceitos:** ${accepted}/${card.members.length}` : '',
    '',
    '**Integrantes**',
    members || '_Nenhum integrante_',
    '',
    '**Total de horas da equipe**',
    `**Total:** ${core.format(totals.normal)}`,
    `**Início:** ${timestamp(card.startedAt)}`,
    `**Encerramento:** ${timestamp(card.endedAt)}`,
    `-# ${(card.history || []).length} evento(s) registrado(s) · Horas individuais preservadas no histórico.`
  ].filter(line => line !== undefined && line !== null).join('\n');
}
function logCard(card) {
  const container = new ContainerBuilder().setAccentColor(accent(statusTone[card.status]));
  container.addTextDisplayComponents(text(`## Registro de ponto\n-# ${stat[card.status] || safe(card.status)} · ${shiftLabel(card.shift)} · ${safe(card.id)}`));
  container.addTextDisplayComponents(text(cardText(card)));
  if (['active', 'paused', 'ended'].includes(card.status) && card.members.some(m => !m.invalidation)) {
    container.addActionRowComponents(row(button(`card:cancel:${card.id}`, 'Cancelar horas', ButtonStyle.Danger)));
    container.addTextDisplayComponents(text('-# Ação restrita à fiscalização autorizada do turno.'));
  } else {
    container.addTextDisplayComponents(text('-# Registro arquivado para consulta e auditoria.'));
  }
  return {components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: mentions};
}
function auditLog(entry, card = null, guildId = null) {
  const cancel = /cancelamento de horas/i.test(entry.type);
  const success = /Entrada|Retorno|aceitou/i.test(entry.type);
  const container = new ContainerBuilder().setAccentColor(
    cancel ? COLORS.red : success ? COLORS.green : COLORS.blue
  );
  container.addTextDisplayComponents(text(`## ${cancel ? 'Cancelamento de horas' : 'Registro de auditoria'}\n-# ${safe(entry.type)}`));
  container.addTextDisplayComponents(text([
    `**Cartão:** ${safe(entry.cardId)}`,
    card ? `**Equipe:** ${safe(card.name)}` : '',
    `**Turno:** ${shiftLabel(entry.shift)}`,
    `**Responsável:** <@${entry.actorId}>`,
    `**Data e hora:** ${timestamp(entry.at)}`,
    guildId && card?.logMessageId && card?.logChannelId
      ? `**Registro original:** [Abrir no Discord](https://discord.com/channels/${guildId}/${card.logChannelId}/${card.logMessageId})` : ''
  ].filter(Boolean).join('\n')));
  if (entry.affected?.length) container.addTextDisplayComponents(text(
    '**Horas invalidadas**\n' + entry.affected.map(a =>
      `• <@${a.userId}> — **${core.format(a.ms)}** · Horas registradas`
    ).join('\n').slice(0, 3500)
  ));
  if (entry.reason) container.addTextDisplayComponents(text(
    `**Motivo do cancelamento**\n> ${safe(entry.reason).replaceAll('\n', '\n> ')}`
  ));
  container.addTextDisplayComponents(text('-# Histórico mantido para conferência da administração.'));
  return {components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: mentions};
}
function inviteDM(card, guildId, targetId, kind = 'initial', classification) {
  const joining = kind !== 'initial';
  const who = 'Horas do turno';
  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(joining ? 'Convite • Entrar na equipe' : 'Convite • Novo ponto em equipe')
    .setDescription('Confira seu turno, a modalidade das horas e o responsável antes de confirmar. O convite é pessoal.')
    .addFields(
      {name: 'Equipe', value: safe(card.name), inline: true},
      {name: 'Turno', value: shiftLabel(card.shift), inline: true},
      {name: 'Cartão', value: safe(card.id), inline: true},
      {name: 'Responsável', value: `<@${card.leaderId}>`, inline: true},
      {name: 'Modalidade', value: who, inline: false},
      {name: 'Início da contagem', value: joining ? 'Após seu aceite' : 'Quando todos aceitarem', inline: false}
    )
    .setFooter({text: 'CENTRAL DE HORAS • Convite pessoal • Não compartilhe esta mensagem'})
    .setTimestamp();
  const yes = joining ? `dj:yes:${guildId}:${card.id}` : `dm:yes:${guildId}:${card.id}`;
  const no = joining ? `dj:no:${guildId}:${card.id}` : `dm:no:${guildId}:${card.id}`;
  return {
    embeds: [embed],
    components: [row(button(yes, 'Aceitar convite', ButtonStyle.Success), button(no, 'Recusar convite', ButtonStyle.Danger))],
    allowedMentions: mentions
  };
}
function dmOutcome(content) {
  const message = String(content || 'Convite atualizado.');
  const ok = /^✅/.test(message), pending = /^⌛/.test(message) || /^⚠️/.test(message);
  const cleaned = message.replace(/^[✅⚠️❌⌛]\s*/u, '');
  return new EmbedBuilder()
    .setColor(ok ? COLORS.green : pending ? COLORS.amber : COLORS.red)
    .setTitle(ok ? 'Convite confirmado' : pending ? 'Atualização do convite' : 'Convite indisponível')
    .setDescription(cleaned)
    .setFooter({text: 'CENTRAL DE PONTO · Equipes e turnos'})
    .setTimestamp();
}
function select(id, options, placeholder = 'Selecione', max = 1) {
  return row(new StringSelectMenuBuilder()
    .setCustomId(id).setPlaceholder(placeholder)
    .setMinValues(1).setMaxValues(max).addOptions(...options));
}
function roleSelect(id, max = 1) {
  return row(new RoleSelectMenuBuilder().setCustomId(id)
    .setPlaceholder('Selecionar cargos (ou limpar)').setMinValues(0).setMaxValues(max));
}
function channelSelect(id) {
  return row(new ChannelSelectMenuBuilder().setCustomId(id)
    .setPlaceholder('Selecionar canal de texto').addChannelTypes(ChannelType.GuildText)
    .setMinValues(0).setMaxValues(1));
}
function shiftConfig(settings, shift) {
  const s = settings.shifts[shift];
  return v2(`⚙️ ${shiftLabel(shift)} • CONFIGURAÇÃO`,
    `> Cada turno possui suas próprias regras.\n\n` +
    `**🕒 Funcionamento:** ${s.start} às ${s.end} (${safe(settings.timezone)})\n` +
    `**🎭 Cargos permitidos:** ${s.roleIds.length ? s.roleIds.map(id => `<@&${id}>`).join(' · ') : '⚠️ Não configurados'}\n` +
    `**👑 Responsáveis:** ${s.supervisorRoles.length ? s.supervisorRoles.map(id => `<@&${id}>`).join(' · ') : '⚠️ Não configurados'}\n` +
    `**📁 Logs do turno:** ${s.logChannelId ? `<#${s.logChannelId}>` : '⚠️ Não configurado'}\n\n` +
    '-# As mudanças de cargo e canal valem para novos cartões. Os cartões anteriores conservam o histórico.',
    [row(button(`cfg:hours:${shift}`, 'Horários', ButtonStyle.Primary, '🕒'), button(`cfg:roles:${shift}`, 'Cargos', ButtonStyle.Secondary, '🎭')),
      row(button(`cfg:super:${shift}`, 'Responsáveis', ButtonStyle.Secondary, '👑'), button(`cfg:log:${shift}`, 'Canal de logs', ButtonStyle.Secondary, '📁')),
      row(button('cfg:shifts', 'Voltar aos turnos', ButtonStyle.Secondary, '↩️'))], true, 'purple');
}
function config(settings) {
  const count = Object.values(settings.shifts || {}).filter(t => (t.roleIds || []).length && t.logChannelId).length;
  return v2('CENTRAL DE CONFIGURAÇÕES',
    `> Ajustes do servidor • ${count}/4 turnos com cargos e logs configurados\n\n` +
    `### Jornada e equipes\n` +
    `**Modalidade:** ${settings.pointMode === 'individual' ? 'Individual' : 'Equipe'}\n` +
    `**⏱️ Horas obrigatórias (todos os turnos):** ${settings.mandatoryMinutes/60}h\n` +
    `**Equipe:** ${settings.minMembers}–${settings.maxMembers} integrantes · Convite: ${settings.inviteMinutes} min\n\n` +
    `### Segurança e registro\n` +
    `**Fuso horário:** ${safe(settings.timezone)}\n` +
    `**Cargo em serviço:** ${settings.serviceRoleId ? `<@&${settings.serviceRoleId}>` : 'Não configurado'}\n` +
    `**Auditoria:** ${settings.auditChannelId ? `<#${settings.auditChannelId}>` : 'Não configurada'}\n` +
     `**📋 Logs de presença:** ${settings.presenceLogChannelId ? `<#${settings.presenceLogChannelId}>` : 'Não configurado'} · ${settings.presenceReportsEnabled?'Ativado':'Desativado'}\n\n` +
    `-# Justificativas e advertências são configuradas no painel /paineljustificativas. Fiscalização: /fiscalizarponto.`,
    [row(button('cfg:shifts', 'Turnos e cargos', ButtonStyle.Primary, '🕒'), button('cfg:mode', 'Ativar equipes', ButtonStyle.Secondary, '👥')),
      row(button('cfg:rules', 'Equipe e convites', ButtonStyle.Secondary, '📨'), button('cfg:mandatory','Horas obrigatórias',ButtonStyle.Primary,'⏱️')),
      row(button('cfg:service', 'Cargo em serviço', ButtonStyle.Secondary, '🏷️'), button('cfg:notify', 'Notificações e PV', ButtonStyle.Secondary, '🔔')),
      row(button('cfg:audit', 'Auditoria', ButtonStyle.Secondary, '🛡️'), button('cfg:presence','Logs de presença',ButtonStyle.Primary,'📋')),
      row(button('cfg:logs', 'Logs Bate-Ponto', ButtonStyle.Primary, '📁'), button('cfg:visual', 'Aparência e banner', ButtonStyle.Secondary, '🎨'))],
    true, 'purple');
}
function mandatoryConfig(settings) {
 return v2('⏱️ HORAS OBRIGATÓRIAS',
  '**Meta global:** '+settings.mandatoryMinutes/60+' hora(s)\\n\\n' +
  'A meta é igual nos turnos 🌅 Manhã, ☀️ Tarde, 🌙 Noite e 🌌 Madrugada.\\n' +
  '✅ Ponto individual encerra sozinho ao cumprir a meta.\\n' +
  '👥 Ponto em equipe encerra quando todos os integrantes válidos cumprirem a meta.\\n' +
  '⏸️ Tempo pausado não conta.\\n\\n' +
  '-# Esta configuração vale para cartões criados depois da alteração. Histórico anterior preservado.',
  [row(button('cfg:mandatory-edit', 'Alterar meta obrigatória', ButtonStyle.Primary, '⚙️')),
   row(button('bp:config','Voltar às configurações', ButtonStyle.Secondary, '↩️'))], true, 'purple');
}
function logsConfig(settings, notice = '') {
  const lines = logSetup.status(settings).map(item =>
    '• **' + item.label + ':** ' + (item.id ? '<#' + item.id + '>' : 'Não configurado')
  );
  return v2('📁 LOGS BATE-PONTO',
    (notice ? '**' + safe(notice) + '**\n\n' : '') +
    '**Categoria:** ' + (settings.logCategoryId ? '<#' + settings.logCategoryId + '>' : 'Não criada') + '\n\n' +
    lines.join('\n') + '\n\n' +
    '-# A criação monta os canais privados e liga os logs automaticamente. Cartões antigos continuam com seus registros originais.',
    [row(button('cfg:logs-create', 'Criar canais automaticamente', ButtonStyle.Success, '📁')),
      row(button('cfg:logs', 'Ver canais configurados', ButtonStyle.Secondary, '🔎')),
      row(button('bp:config', 'Voltar às configurações', ButtonStyle.Secondary, '↩️'))],
    true, 'purple');
}
function teamMenu(c) {
  const spaces = Math.max(0, 4 - c.members.length - Object.keys(c.joinInvites || {}).length);
  return v2('👥 𝗚𝗘𝗥𝗘𝗡𝗖𝗜𝗔𝗥 𝗘𝗤𝗨𝗜𝗣𝗘',
    `**👑 Equipe:** ${safe(c.name)}  ·  **🆔 ${c.id}**\n` +
    `**🕒 Turno:** ${shiftLabel(c.shift)}\n` +
    `**📡 Situação:** ${stat[c.status]}\n` +
    `**👥 Integrantes:** ${c.members.length}  ·  **Vagas:** ${spaces}\n\n` +
    `**👤 Membros:** apenas pessoas com cargo deste turno.\n\n` +
    '-# A contagem começa somente depois que a pessoa aceitar o convite.',
    [row(button(`team:normal:${c.id}`, 'Adicionar membro', ButtonStyle.Primary, '👤')),
      row(button(`team:members:${c.id}`, 'Ver integrantes', ButtonStyle.Secondary, '👥'))], true, 'cyan');
}
function pagerOptions(candidates, page) {
  return candidates.slice(page * 25, (page + 1) * 25).map(c => ({
    label: c.label.slice(0, 100), description: c.desc.slice(0, 100), value: c.id
  }));
}
function candidateView(session) {
  const opts = pagerOptions(session.candidates, session.page);
  const pages = Math.max(1, Math.ceil(session.candidates.length / 25));
  const chosen = (session.selected || []).length;
  const summary = chosen ? session.selected.map(id => `<@${id}>`).join(' · ') : 'Ninguém selecionado';
  const rows = [];
  if (opts.length) rows.push(select(`pick:${session.kind}:${session.key}`, opts, 'Selecione um integrante disponível'));
  rows.push(row(button('cand:search', 'Buscar por nome', ButtonStyle.Secondary), button('cand:reload', 'Atualizar disponíveis', ButtonStyle.Secondary)));
  if (pages > 1) rows.push(row(button('page:prev', 'Anterior', ButtonStyle.Secondary, '◀️'), button('page:next', 'Próxima', ButtonStyle.Secondary, '▶️')));
  if (session.kind === 'draft') rows.push(row(button('draft:send', 'Enviar convites', ButtonStyle.Success, '📨'), button('draft:clear', 'Limpar seleção', ButtonStyle.Secondary)));
  rows.push(row(button('cand:exit', 'Fechar', ButtonStyle.Secondary)));
  return v2(session.kind === 'draft' ? 'EQUIPE • ESCOLHER CONVIDADOS' : 'EQUIPE • ADICIONAR MEMBRO',
    `${session.draft?.name ? `**Equipe:** ${safe(session.draft.name)}\n` : ''}` +
    `**Turno:** ${shiftLabel(session.shift)}\n` +
    `**Tipo:** Integrantes do próprio turno\n` +
    `**Disponíveis:** ${session.candidates.length} · **Página:** ${session.page + 1}/${pages}\n` +
    (session.search ? `**Busca:** ${safe(session.search)}\n` : '') +
    `\n### Selecionados (${chosen})\n${summary}\n\n` +
    (opts.length ? 'Escolha os integrantes na lista e confirme os convites.' : 'Nenhum membro disponível neste filtro. Use Atualizar ou confira os cargos do turno.') +
    '\n-# Pessoas com ponto ativo ou convite pendente não aparecem na lista. A disponibilidade é checada novamente ao enviar.',
    rows, true, 'purple');
}
function presenceConfig(s){return v2('📋 LOGS DE PRESENÇA',
 `**Canal único:** ${s.presenceLogChannelId?`<#${s.presenceLogChannelId}>`:'Não configurado'}\n`+
 `**Envio automático:** ${s.presenceReportsEnabled?'✅ Ativado':'⛔ Desativado'}\n\n`+
 'Ao terminar cada turno, o Nero envia um relatório com presentes, presenças parciais, faltas e justificativas. Os horários já configurados serão utilizados.',
 [row(button('cfg:presence-channel','Escolher canal',ButtonStyle.Primary,'📨'),button('cfg:presence-toggle',s.presenceReportsEnabled?'Desativar':'Ativar',ButtonStyle.Secondary,'🔁')),
 row(button('bp:config','Voltar',ButtonStyle.Secondary,'↩️'))],true,'purple')}
function modeConfig(settings){return v2('👥 ATIVAR EQUIPES',
 `**Equipes:** ${settings.pointMode==='team'?'✅ ATIVADAS':'⛔ DESATIVADAS'}\n\n`+
 '**Ativar equipes:** membros precisam aceitar o convite antes de iniciar o ponto.\n'+
 '**Desativar equipes:** cada integrante inicia, pausa e encerra o próprio ponto individualmente.\n\n'+
 '-# Altere também pelo site em Configurações → Ativar equipes. A alteração afeta apenas novos cartões.',
 [row(button('cfg:mode-team','Ativar equipes',ButtonStyle.Success),button('cfg:mode-individual','Desativar equipes',ButtonStyle.Danger)),row(button('bp:config','Voltar',ButtonStyle.Secondary,'↩️'))],true,'purple')}
function justificationPanel(ephemeral=false,visual=null){
  const banner='justificacao-dark.gif';
  const v=visual||{};
  const title=safe(v.title||'Justificativa de ausência');
  const description=safe(v.description||'Solicite a análise de uma ausência pela Central de Horas.');
  const gif=v.customGif||null;
  const c=new ContainerBuilder().setAccentColor(COLORS.purple);
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(gif||`attachment://${banner}`)
      .setDescription('CENTRAL DE HORAS — JUSTIFICATIVAS')
  ));
  c.addTextDisplayComponents(text(`## ${title}`));
  c.addTextDisplayComponents(text(description));
  c.addTextDisplayComponents(text(
    'Informe a **data inicial**, a **quantidade de dias de serviço** e o **motivo**. A equipe responsável analisa a solicitação. '+
    'Enquanto estiver pendente, uma eventual advertência daquele dia fica suspensa.\n\n'+
    '-# Evite incluir dados médicos ou outras informações sensíveis.'
  ));
  c.addActionRowComponents(row(button('just:open','Justificar ausência',ButtonStyle.Primary,'📝'),button('just:config','Configurações',ButtonStyle.Secondary,'⚙️')));
  c.addTextDisplayComponents(text('-# CENTRAL DE PONTO • JUSTIFICATIVAS'));
  return {components:[c],flags:MessageFlags.IsComponentsV2|(ephemeral?MessageFlags.Ephemeral:0),allowedMentions:mentions,
    ...(gif?{}:{files:[new AttachmentBuilder(path.join(__dirname,'..','assets',banner),{name:banner})]})};
}
function justificationConfig(s){const j=s.justifications;
 return v2('JUSTIFICATIVAS · CONFIGURAÇÕES',
 `**Canal de análise:** ${j.reviewChannelId?`<#${j.reviewChannelId}>`:'Ainda não definido'}\n`+
 `**Logs de justificativas:** ${j.logChannelId?`<#${j.logChannelId}>`:'Usar canal de análise'}\n`+
 `**Publicação de advertências:** ${j.warningChannelId?`<#${j.warningChannelId}>`:'Ainda não definida'}\n\n`+
 'O responsável aprova ou recusa cada solicitação no canal de análise.\n'+
 'Uma justificativa aprovada abona a ausência; a recusada não. A decisão também é enviada ao site.\n\n'+
 '-# Os cargos dos turnos não são alterados por estas configurações.',
 [row(button('cfg:just-review','Canal de análise',ButtonStyle.Primary,'📥'),button('cfg:just-log','Logs de justificativas',ButtonStyle.Secondary,'📋')),
  row(button('cfg:just-warning','Canal de advertências',ButtonStyle.Secondary,'📢'),button('cfg:just-roles','Cargos de advertência',ButtonStyle.Secondary,'🛡️')),
  row(button('just:home','Voltar ao painel',ButtonStyle.Secondary,'↩️'))],true,'purple')}
function justificationRolesConfig(s){const j=s.justifications;
 return v2('ADVERTÊNCIAS · 3 NÍVEIS',
 `**Regra:** duas faltas consecutivas sem justificativa e sem folga.\n`+
 '**Decisão:** a Central de Horas autoriza; o bot revalida e aplica.\n\n'+
 j.warningRoles.map((r,i)=>`**${i+1}ª advertência:** ${r?`<@&${r}>`:'Cargo não configurado'}`).join('\n')+
 `\n\n**Automático:** ${j.autoWarnings?'Ativado':'Desligado'}\n`+
 '**Progressão:** ao aplicar o nível seguinte, remove o cargo anterior.\n\n'+
 '-# Desligado inicialmente. Requer dois dias de trabalho comprovados e sincronização ativa.',
 [row(button('cfg:just-role-1','Cargo 1',ButtonStyle.Secondary),button('cfg:just-role-2','Cargo 2',ButtonStyle.Secondary),button('cfg:just-role-3','Cargo 3',ButtonStyle.Secondary)),
  row(button('cfg:just-toggle',j.autoWarnings?'Desativar automático':'Ativar automático',j.autoWarnings?ButtonStyle.Danger:ButtonStyle.Success)),
  row(button('cfg:just','Voltar às justificativas',ButtonStyle.Secondary,'↩️'))],true,'purple')}
function notificationsConfig(s){const n=s.notifications;
 return v2('NOTIFICAÇÕES · MENSAGENS PRIVADAS',
 `**Comprovante por mensagem:** ${n.pointDm?'Ativado':'Desligado'}\n\n`+
 'Ao encerrar o ponto, cada integrante recebe um comprovante organizado com equipe, turno, início, fim, horas válidas e pausas, além de um botão para abrir o site.\n'+
 '-# Não são enviadas imagens PNG ou arquivos. Se o membro bloquear mensagens privadas, o cartão será encerrado normalmente e o bot registrará o aviso nos logs.',
 [row(button('cfg:notify-dm',n.pointDm?'Desativar mensagens no PV':'Ativar mensagens no PV',ButtonStyle.Secondary,'✉️')),
  row(button('bp:config','Voltar',ButtonStyle.Secondary,'↩️'))],true,'purple')}
function justificationReview(j){return v2('SOLICITAÇÃO DE JUSTIFICATIVA',
 `**Protocolo:** ${safe(j.id)}\n**Membro:** <@${j.userId}>\n**Turno:** ${shiftLabel(j.shift)}\n`+
 `**Período:** ${(j.dates||[j.date]).map(formatDateBR).join(', ')} (${j.days||1} dia(s))\n**Motivo:** ${safe(j.reason)}\n**Status:** Em análise`,
 [row(button(`justify:approve:${j.id}`,'Aprovar',ButtonStyle.Success),button(`justify:reject:${j.id}`,'Recusar',ButtonStyle.Danger))],false,'amber')}
function justificationDecisionLog(j){return v2(j.status==='approved'?'JUSTIFICATIVA APROVADA':'JUSTIFICATIVA RECUSADA',
 `**Protocolo:** ${safe(j.id)}\n**Membro:** <@${j.userId}>\n**Turno:** ${shiftLabel(j.shift)}\n`+
 `**Datas da ausência:** ${(j.dates||[j.date]).map(formatDateBR).join(', ')}\n**Motivo informado:** ${safe(j.reason)}\n`+
 `**Analisado por:** <@${j.reviewerId}>\n`+
 `**Resultado:** ${j.status==='approved'?'Falta abonada — sem advertência por este dia.':'Falta não abonada — entra na avaliação de presença.'}`,
 [],false,j.status==='approved'?'green':'red')}
function justificationDM(j){return new EmbedBuilder().setColor(j.status==='approved'?COLORS.green:j.status==='rejected'?COLORS.red:COLORS.amber)
 .setTitle(j.status==='approved'?'Justificativa aprovada':j.status==='rejected'?'Justificativa recusada':'Justificativa em análise')
 .setDescription(`**Protocolo:** ${safe(j.id)}\n**Datas:** ${(j.dates||[j.date]).map(formatDateBR).join(', ')}\n**Turno:** ${shiftLabel(j.shift)}`)
 .setFooter({text:'CENTRAL DE PONTO · Ausências'}).setTimestamp()}
function pointReceipt(card,member){
 const minutes=core.format(core.durationFor(member,card.endedAt||Date.now()));
 const pauses=(card.history||[]).filter(h=>h.event==='paused').length;
 return new EmbedBuilder().setColor(COLORS.green)
  .setTitle('✅ Ponto encerrado • Seu comprovante')
  .setDescription(`**Equipe:** ${safe(card.name)}\n**Turno:** ${shiftLabel(card.shift)}\n**Tipo:** Horas registradas\n\nSeu ponto foi encerrado. Confira os dados abaixo:`)
  .addFields(
   {name:'🪪 Cartão',value:safe(card.id),inline:true},
   {name:'📌 Situação',value:stat[card.status]||'Encerrado',inline:true},
   {name:'🟢 Início',value:timestamp(member.joinedAt),inline:false},
   {name:'🏁 Encerramento',value:timestamp(card.endedAt),inline:false},
   {name:'⏱️ Horas válidas',value:minutes,inline:true},
   {name:'⏸️ Pausas da equipe',value:String(pauses),inline:true}
  )
  .setFooter({text:'CENTRAL DE HORAS • Comprovante individual • Desenvolvido por Cetus'})
  .setTimestamp();
}
function receiptActions(){
 return [row(new ButtonBuilder().setLabel('Abrir Central de Horas').setStyle(ButtonStyle.Link).setURL('https://central-de-horas1.vercel.app/'))];
}
function receiptPhotoEmbed(card,member,fileName){
 return new EmbedBuilder().setColor(COLORS.green)
  .setTitle('Comprovante digital • Ponto encerrado')
  .setDescription(`**${safe(card.name)}** · ${shiftLabel(card.shift)}\nCartão ${safe(card.id)} · Horas registradas`)
  .setImage(`attachment://${fileName}`)
  .setFooter({text:'Central de Ponto · Registro individual'});
}
function warningDM(w){return new EmbedBuilder().setColor(COLORS.red).setTitle(`Advertência ${w.level} registrada`)
 .setDescription(`**Motivo:** ${safe(w.reason)}\n**Turno:** ${shiftLabel(w.shift)}\n**Dia:** ${safe(formatDateBR(w.date))}\n`+
 'Se houver algum erro, entre em contato com a administração para revisão.')
 .setFooter({text:'CENTRAL DE PONTO · Histórico auditável'}).setTimestamp()}
function warningLog(w){return v2(w.status==='revoked'?'ADVERTÊNCIA REVOGADA':'ADVERTÊNCIA AUTOMÁTICA',
 `**Registro:** ${safe(w.id)}\n**Membro:** <@${w.userId}>\n**Turno:** ${shiftLabel(w.shift)}\n`+
 `**Nível:** ${w.level} de 3\n**Data:** ${safe(formatDateBR(w.date))}\n**Motivo:** ${safe(w.reason)}\n`+
 `**Situação:** ${w.status==='revoked'?'Revisada e revogada':'Ativa'}`,
 w.status==='active'?[row(button(`warn:revoke:${w.id}`,'Revisar / revogar',ButtonStyle.Secondary))]:[],false,w.status==='revoked'?'slate':'red')}
module.exports = {
  COLORS, safe, mentions, row, button, v2, msg, panel, cardText, logCard, auditLog,
  inviteDM, dmOutcome, select, roleSelect, channelSelect, config, shiftConfig, logsConfig, mandatoryConfig, notificationsConfig,justificationRolesConfig,
  teamMenu, candidateView, stat,modeConfig,presenceConfig,justificationPanel,justificationConfig,justificationReview,justificationDecisionLog,justificationDM,warningDM,warningLog,pointReceipt,receiptPhotoEmbed,receiptActions
};
