'use strict';
// Testa limite de layout sem precisar de conexão ao Discord ou do token do bot.
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const {defaultGuild,TYPES, MODULES}=require('../src/config');
class FakeBuilder{
 constructor(){this.children=[];this.value=null;}
 addActionRowComponents(...c){this.children.push(...c);return this;}
 addMediaGalleryComponents(...c){this.children.push(...c);return this;}
 addSeparatorComponents(...c){this.children.push(...c);return this;}
 addTextDisplayComponents(...c){this.children.push(...c);return this;}
 addComponents(...c){this.children.push(...c);return this;}
 addItems(...c){this.children.push(...c);return this;}
 addOptions(...c){this.children.push(...c);return this;}
 addChannelTypes(){return this;}
 setAccentColor(){return this;} setURL(v){this.value=v;return this;}
 setContent(v){this.value=v;return this;} setCustomId(v){this.id=v;return this;}
 setPlaceholder(){return this;} setLabel(){return this;} setStyle(v){this.style=v;return this;}
 setEmoji(v){this.emoji=v;return this;} setMinValues(){return this;} setMaxValues(){return this;}
 setDescription(){return this;} setDisabled(){return this;}
}
const fakeDiscord={AttachmentBuilder:FakeBuilder,ActionRowBuilder:FakeBuilder,ButtonBuilder:FakeBuilder,ContainerBuilder:FakeBuilder,MediaGalleryBuilder:FakeBuilder,MediaGalleryItemBuilder:FakeBuilder,TextDisplayBuilder:FakeBuilder,SeparatorBuilder:FakeBuilder,StringSelectMenuBuilder:FakeBuilder,RoleSelectMenuBuilder:FakeBuilder,UserSelectMenuBuilder:FakeBuilder,ChannelSelectMenuBuilder:FakeBuilder,MessageFlags:{IsComponentsV2:32768,Ephemeral:64},ButtonStyle:{Primary:1,Secondary:2,Success:3,Danger:4},ChannelType:{GuildText:0}};
const original=Module._load;
let ui;
try{
 Module._load=function(req,parent,...args){if(req==='discord.js')return fakeDiscord;return original.call(this,req,parent,...args);};
 delete require.cache[require.resolve('../src/ui')];ui=require('../src/ui');
}finally{Module._load=original;}
test('cada painel V2 tem GIF com nome próprio e máximo 10 filhos no container',()=>{
 const g=defaultGuild();
 for(const m of Object.keys(MODULES)) for(const type of Object.keys(TYPES)){
  const result=ui.panel(g,m,type);
  assert.ok(result.flags&32768,`${m}:${type} sem Components V2`);
  assert.ok(result.components[0].children.length<=10,`${m}:${type} tem ${result.components[0].children.length} filhos`);
  assert.ok(result.files?.length===1,`${m}:${type} sem GIF`);
  assert.ok(result.components[0].children[0].children[0].value===`attachment://${m}-${type}.gif`);
 }
});
test('configuração de cargos e seleção de cartões não estouram o limite V2',()=>{
 const g=defaultGuild();
 for(const m of Object.keys(MODULES))for(const type of Object.keys(TYPES)){
   for(const mode of ['roles','channels']){
    const result=ui.panelSelectsCard(g,m,type,mode);
    assert.ok(result.components[0].children.length<=10,`${m}/${type}/${mode}`);
   }
 }
});

test('os 26 painéis têm cabeçalho temático e dicas visuais com emojis',()=>{
 const g=defaultGuild();
 for(const module of Object.keys(MODULES))for(const type of Object.keys(TYPES)){
   const blocks=ui.panel(g,module,type).components[0].children;
   const texts=blocks.filter(x=>typeof x.value==='string').map(x=>x.value);
   assert.ok(texts.some(x=>x.includes(module==='org'?'👑 ORGANIZAÇÃO RP':'🚔 POLÍCIA RP')),`Cabeçalho do módulo: ${module}/${type}`);
   assert.ok(texts.some(x=>x.includes('### ')&&x.includes('> ')&&x.includes('👇') || x.includes('### ')&&x.includes('> ')&&x.includes('·')),`Seção descritiva: ${module}/${type}`);
   const buttons=blocks.flatMap(x=>x.children||[]).filter(x=>typeof x.style==='number');
   assert.ok(buttons.length>0,`Sem botões em ${module}/${type}`);
   assert.ok(buttons.every(x=>typeof x.emoji==='string'&&x.emoji.length>0),`Botão sem emoji: ${module}/${type}`);
 }
});
test('menus de configuração organizam cargos, canais e logs por emoji',()=>{
 const g=defaultGuild();
 for(const module of Object.keys(MODULES)){
  const publicConfig=ui.settingsCard(g,module).components[0].children.filter(x=>x.value).map(x=>x.value).join('\n');
  assert.ok(publicConfig.includes('👥 Cargos da equipe'));
  assert.ok(publicConfig.includes('🗃️ Canais'));
  const panelConfig=ui.panelSettingsCard(g,module,'plantao').components[0].children.filter(x=>x.value).map(x=>x.value).join('\n');
  assert.ok(panelConfig.includes('🧾 **Logs:**'));
  assert.ok(panelConfig.includes('🎞️ **Banner:**'));
 }
});

test('central oferece anúncio e painel Gestão contém três ações disciplinadoras',()=>{
 const g=defaultGuild();
 for(const module of Object.keys(MODULES)){
  const central=ui.panel(g,module,'central').components[0].children;
  const ids=central.flatMap(x=>x.children||[]).map(x=>x.id).filter(Boolean);
  assert.ok(ids.includes(`staff:announce:${module}`));
  const gestion=ui.panel(g,module,'gestao').components[0].children;
  const management=gestion.flatMap(x=>x.children||[]).map(x=>x.id).filter(Boolean);
  for(const value of [`career:start:${module}:promocao`,`career:start:${module}:rebaixamento`,`open:punicoes:${module}:gestao`,`career:settings:${module}`])assert.ok(management.includes(value),value);
  assert.ok(gestion.length<=10);
 }
});
test('central de configuração tem seletores de cargos e canais gerais',()=>{
 const g=defaultGuild();
 for(const module of Object.keys(MODULES)){
   const main=ui.settingsCard(g,module).components[0].children;
   const ids=main.flatMap(x=>x.children||[]).map(x=>x.id).filter(Boolean);
   assert.ok(ids.includes(`config:globalroles:${module}`));
   assert.ok(ids.includes(`config:globalchannels:${module}`));
   for(const mode of ['roles','channels']){
     const view=ui.globalSettingsCard(g,module,mode);
     const blocks=view.components[0].children;
     const selectorIds=blocks.flatMap(x=>x.children||[]).map(x=>x.id).filter(Boolean);
     assert.ok(selectorIds.some(id=>id.startsWith(mode==='roles'?'globalrole:':'globalchannel:')));
     assert.ok(blocks.length<=10);
   }
 }
});
test('26 painéis sem escalas e CSV e gestão tem configurações próprias',()=>{
 const g=defaultGuild();
 for(const m of ['org','policia']){
  for(const type of ['ausencias','historico','gestao']){
   const view=ui.panel(g,m,type);assert.ok(view.files?.[0]);
   assert.ok(view.components[0].children.length<=10);
  }
  const central=ui.panel(g,m,'central');
  const ids=central.components[0].children.flatMap(x=>x.children||[]).map(x=>x.id);
  assert.ok(ids.includes(`open:ausencias:${m}:central`));
  assert.ok(ids.includes(`profile:mine:${m}`));
  assert.ok(!ids.some(x=>x?.startsWith('schedule:')));
  const view=ui.careerSettingsCard(g,m);
  const selectorIds=view.components[0].children.flatMap(x=>x.children||[]).map(x=>x.id);
  for(const k of ['promocoes','rebaixamentos','advertencias'])assert.ok(selectorIds.includes(`careerchannel:${m}:${k}`));
  assert.ok(selectorIds.includes(`careerroles:${m}`));
  assert.ok(view.components[0].children.length<=10);
  const wizard=ui.careerWizardCard(m,{mode:'promocao',targetId:null,addRoles:[],removeRoles:[],reason:''});
  assert.ok(wizard.components[0].children.length<=10);
  assert.ok(ui.profileCard(g,m,'123456789012345678').components[0].children.length<=10);
 }
});
