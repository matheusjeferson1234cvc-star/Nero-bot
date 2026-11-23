'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const core = require('../src/core');

// Validação estrutural com construtores simulados, sem rede nem token.
// Não substitui o teste com a biblioteca real e um servidor Discord.
class Fake {
  constructor() { this.components = []; this.fields = []; this.items = []; }
  setAccentColor(v) { this.accent = v; return this; }
  setColor(v) { this.color = v; return this; }
  setContent(v) { this.content = v; return this; }
  setTitle(v) { this.title = v; return this; }
  setDescription(v) { this.description = v; return this; }
  setImage(v) { this.image = v; return this; }
  setFooter(v) { this.footer = v; return this; }
  setTimestamp() { this.timestamped = true; return this; }
  setURL(v) { this.url = v; return this; }
  setCustomId(v) { this.customId = v; return this; }
  setLabel(v) { this.label = v; return this; }
  setStyle(v) { this.style = v; return this; }
  setEmoji(v) { this.emoji = v; return this; }
  setPlaceholder(v) { this.placeholder = v; return this; }
  setMinValues(v) { this.minValues = v; return this; }
  setMaxValues(v) { this.maxValues = v; return this; }
  addComponents(...items) { this.components.push(...items); return this; }
  addActionRowComponents(...items) { return this.addComponents(...items); }
  addTextDisplayComponents(...items) { return this.addComponents(...items); }
  addMediaGalleryComponents(...items) { return this.addComponents(...items); }
  addItems(...items) { this.items.push(...items); return this; }
  addOptions(...items) { this.items.push(...items); return this; }
  addFields(...items) { this.fields.push(...items); return this; }
  addChannelTypes() { return this; }
}
class AttachmentBuilder { constructor(file, options) { this.file = file; this.options = options; } }
const mock = {
  AttachmentBuilder, ContainerBuilder: Fake, TextDisplayBuilder: Fake, MediaGalleryBuilder: Fake,
  MediaGalleryItemBuilder: Fake, EmbedBuilder: Fake, ActionRowBuilder: Fake,
  ButtonBuilder: Fake, StringSelectMenuBuilder: Fake, RoleSelectMenuBuilder: Fake,
  ChannelSelectMenuBuilder: Fake, ChannelType: {GuildText: 0},
  ButtonStyle: {Success: 3, Secondary: 2, Primary: 1, Danger: 4},
  MessageFlags: {IsComponentsV2: 32768, Ephemeral: 64}
};
const original = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'discord.js') return mock;
  return original.apply(this, arguments);
};
let ui;
try { ui = require('../src/ui'); } finally { Module._load = original; }
const flattened = obj => {
  if (!obj || typeof obj !== 'object') return '';
  return [obj.content || '', obj.description || '', obj.title || '', ...(obj.components || []).map(flattened)].join('\n');
};
function fixture(status = 'active') {
  const g = core.defaultGuild();
  const card = core.createCard(g, {
    shift: 'tarde', name: 'Equipe ALFA', leaderId: '111111111111111111',
    invitees: ['222222222222222222'], now: Date.now() - 1000
  });
  if (status !== 'pending') {
    core.respondInvite(card, '222222222222222222', true, Date.now() - 900);
    core.launch(card, Date.now() - 800);
    if (status === 'paused') core.pause(card, card.leaderId, Date.now() - 500);
    if (status === 'ended') core.finish(card, card.leaderId, Date.now() - 400);
    if (status === 'canceled') core.cancelHours(card, card.members.map(m => m.userId), {
      actor: '333333333333333333', reason: 'Registro indevido confirmado', now: Date.now() - 200
    });
  }
  return card;
}
test('painel principal atualizado mantém GIF e ações funcionais em três linhas', () => {
  const p = ui.panel(core.defaultSettings().panel);
  const box = p.components[0];
  const actions = box.components.filter(c => c.components.some(x => x.customId));
  assert.equal(actions.length, 3);
  assert.deepEqual(actions.flatMap(r => r.components.map(c => c.customId)),
    ['bp:toggle', 'bp:pause', 'bp:mine', 'bp:team', 'bp:invites', 'bp:ranking', 'bp:config']);
  assert.equal(p.files.length, 1);
  assert.match(flattened(box), /CENTRAL DE PONTO/);
  assert.equal(p.flags, 32768);
});
test('cartões possuem cores por status e deixam cancelar após finalizar', () => {
  const active = ui.logCard(fixture('active'));
  const paused = ui.logCard(fixture('paused'));
  const ended = ui.logCard(fixture('ended'));
  const canceled = ui.logCard(fixture('canceled'));
  assert.equal(active.components[0].accent, ui.COLORS.green);
  assert.equal(paused.components[0].accent, ui.COLORS.amber);
  assert.equal(canceled.components[0].accent, ui.COLORS.red);
  assert.equal(ended.components[0].components.some(c => c.components.some(x => x.customId?.startsWith('card:cancel:'))), true);
  assert.equal(canceled.components[0].components.some(c => c.components.some(x => x.customId?.startsWith('card:cancel:'))), false);
});
test('cartão exibe integrantes e o total de horas sem categoria extra', () => {
  const c = fixture('active');
  c.members[1].type = 'normal';
  const output = ui.cardText(c);
  for (const value of ['<@111111111111111111>', '<@222222222222222222>', 'Horas registradas', 'Total:'])
    assert.ok(output.includes(value), `Faltando: ${value}`);
});
test('convites privados são embeds normais, com aceitar/recusar e sem ping automático', () => {
  const c = fixture('pending');
  const invite = ui.inviteDM(c, '444444444444444444', '222222222222222222', 'join', {type: 'normal', originShift: 'tarde'});
  assert.equal(invite.embeds.length, 1);
  assert.equal(invite.components[0].components.length, 2);
  assert.equal(invite.allowedMentions.parse.length, 0);
  assert.match(JSON.stringify(invite.embeds[0].fields), /Horas do turno/);
  assert.match(JSON.stringify(invite.embeds[0].fields), /Tarde/);
  assert.equal(invite.flags, undefined);
});
test('resposta por DM retira botões e diferencia sucesso, aviso e recusa', () => {
  assert.equal(ui.dmOutcome('✅ Aceito').color, ui.COLORS.green);
  assert.equal(ui.dmOutcome('⚠️ Convite expirado').color, ui.COLORS.amber);
  assert.equal(ui.dmOutcome('❌ Convite recusado').color, ui.COLORS.red);
});
test('auditoria de cancelamento destaca motivo, integrantes e cartão original', () => {
  const card = fixture('ended');
  card.logChannelId = '123456789012345678'; card.logMessageId = '234567890123456789';
  const entry = {type: 'Cancelamento de horas',cardId:card.id,shift:card.shift,
    actorId:'333333333333333333',at:Date.now(),reason:'Horas irregulares por ausência de atividade',
    affected:[{userId:'222222222222222222',ms:600000,type:'extra',originShift:'noite'}]};
  const log = ui.auditLog(entry,card,'987654321098765432');
  const text = flattened(log.components[0]);
  assert.equal(log.components[0].accent, ui.COLORS.red);
  assert.ok(text.includes('Motivo do cancelamento'));
  assert.match(text, /Horas irregulares/);
  assert.match(text, /222222222222222222/);
  assert.match(text, /discord\.com\/channels\/987654321098765432/);
});
test('configuração separa turnos, equipe, auditoria e visual', () => {
  const view = ui.config(core.defaultSettings());
  const ids = view.components[0].components.flatMap(c => (c.components || []).map(x => x.customId)).filter(Boolean);
  assert.deepEqual(ids, ['cfg:shifts','cfg:mode','cfg:rules','cfg:service','cfg:notify','cfg:audit','cfg:presence','cfg:logs','cfg:visual']);
  assert.equal(view.components[0].accent, ui.COLORS.purple);
});

test('logs padronizados mantêm informações e não repetem emojis nos campos', () => {
  const card = fixture('ended');
  const point = flattened(ui.logCard(card).components[0]);
  assert.match(point, /Registro de ponto/);
  assert.match(point, /Total de horas da equipe/);
  assert.match(point, /Integrantes/);
  const audit = flattened(ui.auditLog({
    type: 'Retorno', cardId: card.id, shift: card.shift, actorId: card.leaderId, at: Date.now()
  }, card).components[0]);
  assert.match(audit, /Registro de auditoria/);
  assert.match(audit, /Responsável:/);
  assert.equal(ui.auditLog({type: 'Retorno', cardId: card.id, shift: card.shift, actorId: card.leaderId, at: Date.now()}).components[0].accent, ui.COLORS.green);
});


test('painel de justificativas contém GIF dark animado e ação de envio',()=>{
 const p=ui.justificationPanel();
 assert.equal(p.files?.length,1);
 assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/ui.js'),'utf8'),/justificacao-dark\.gif/);
 assert.ok(require('node:fs').statSync(require('node:path').join(__dirname,'../assets/justificacao-dark.gif')).size>1000);
});

test('configuração de justificativas tem canal de análise, log, avisos e botão voltar',()=>{
 const cfg=core.defaultSettings();
 const box=ui.justificationConfig(cfg).components[0];
 const ids=box.components.flatMap(c=>(c.components||[]).map(x=>x.customId)).filter(Boolean);
 assert.ok(ids.includes('cfg:just-review'));assert.ok(ids.includes('cfg:just-log'));
 assert.ok(ids.includes('cfg:just-warning'));assert.ok(ids.includes('just:home'));
});
test('log de decisão distingue justificativa aprovada e recusada',()=>{
 const j={id:'JST-000001',userId:'111111111111111111',shift:'noite',date:'2026-11-06',reason:'Ausência autorizada pela administração',reviewerId:'222222222222222222'};
 const approved=ui.justificationDecisionLog({...j,status:'approved'});
 const rejected=ui.justificationDecisionLog({...j,status:'rejected'});
 assert.equal(approved.components[0].accent,ui.COLORS.green);
 assert.equal(rejected.components[0].accent,ui.COLORS.red);
 assert.match(flattened(approved.components[0]),/Falta abonada/);
 assert.match(flattened(rejected.components[0]),/Falta não abonada/);
});

test('comprovante PNG vincula a imagem e informações reais ao encerramento',()=>{
 const card=fixture('ended'),member=card.members[0];
 const receipt=ui.receiptPhotoEmbed(card,member,'comprovante-teste.png');
 assert.equal(receipt.image,'attachment://comprovante-teste.png');
 assert.match(receipt.description,/Equipe ALFA/);
 assert.match(receipt.description,/BP-/);
 assert.match(receipt.title,/Ponto encerrado/);
});
test('configurações de justificativas são separadas das configurações de ponto',()=>{
 const settings=core.defaultSettings();
 const point=ui.config(settings);
 const ids=point.components[0].components.flatMap(c=>(c.components||[]).map(x=>x.customId));
 assert.equal(ids.includes('cfg:just'),false);
 const just=ui.justificationPanel();
 const controls=just.components[0].components.flatMap(c=>(c.components||[]).map(x=>x.customId));
 assert.ok(controls.includes('just:config'));
 assert.ok(controls.includes('just:open'));
});

test('modo individual esconde equipe e convites, ícones do ranking e config sem rótulo',()=>{
 const team=ui.panel(core.defaultSettings().panel,'team').components[0];
 const single=ui.panel(core.defaultSettings().panel,'individual').components[0];
 const controls=x=>x.components.flatMap(r=>(r.components||[]).filter(c=>c.customId));
 const regular=controls(team),individual=controls(single);
 assert.ok(regular.some(x=>x.customId==='bp:team'));
 assert.ok(regular.some(x=>x.customId==='bp:invites'));
 assert.ok(!individual.some(x=>x.customId==='bp:team'));
 assert.ok(!individual.some(x=>x.customId==='bp:invites'));
 for(const id of ['bp:ranking','bp:config']){
  const b=individual.find(x=>x.customId===id);
  assert.equal(b.label,undefined);assert.ok(b.emoji);
 }
});
test('logs de presença têm um único canal e opção de ativar ou desativar',()=>{
 const x=core.defaultSettings();
 x.presenceLogChannelId='123456789012345678';
 const uiBox=ui.presenceConfig(x).components[0];
 assert.match(flattened(uiBox),/123456789012345678/);
 const ids=uiBox.components.flatMap(r=>(r.components||[]).map(c=>c.customId));
 assert.ok(ids.includes('cfg:presence-channel'));assert.ok(ids.includes('cfg:presence-toggle'));
});

test('aba Logs Bate-Ponto lista canais e cria a estrutura em um clique', () => {
 const settings=core.defaultSettings();
 const panel=ui.logsConfig(settings);
 const body=flattened(panel.components[0]);
 assert.match(body, /LOGS BATE-PONTO/);
 assert.match(body, /Não configurado/);
 const ids=panel.components[0].components.flatMap(r => (r.components||[]).map(c => c.customId)).filter(Boolean);
 assert.deepEqual(ids, ['cfg:logs-create','bp:config']);
});
