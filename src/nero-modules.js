'use strict';
const D=require('discord.js'),{randomUUID}=require('node:crypto'),store=require('./store'),attendance=require('./attendance');
const P=D.PermissionFlagsBits,B=D.ButtonStyle,E=D.MessageFlags.Ephemeral,V=D.MessageFlags.IsComponentsV2;
const commands=[new D.SlashCommandBuilder().setName('painelatendimento').setDescription('Publicar a Central de Atendimento').setDefaultMemberPermissions(P.Administrator)];
const id=()=>randomUUID().replaceAll('-','').slice(0,16),locks=new Set(),mentions={parse:[]};
const safe=v=>String(v??'').replaceAll('@','@\u200b');
const admin=i=>Boolean(i.memberPermissions?.has(P.Administrator));
const requireAdmin=i=>{if(!admin(i))throw Error('Somente administradores.');};
const row=(...x)=>new D.ActionRowBuilder().addComponents(...x);
const b=(key,label,style=B.Secondary)=>new D.ButtonBuilder().setCustomId('n41:'+key).setLabel(label).setStyle(style);
const td=content=>new D.TextDisplayBuilder().setContent(content);
const sep=()=>new D.SeparatorBuilder().setDivider(true).setSpacing(D.SeparatorSpacingSize.Small);
const defer=i=>i.deferReply({flags:E});
const reply=(i,content)=>i.deferred?i.editReply({content,allowedMentions:mentions}):i.reply({content,flags:E,allowedMentions:mentions});
const field=(i,k)=>i.fields.getTextInputValue(k).trim();
const defaults=[
 {label:'Dúvidas e informações',value:'duvidas',emoji:'❓',description:'Tire suas dúvidas.'},
 {label:'Suporte técnico',value:'suporte',emoji:'🛠️',description:'Ajuda com problemas técnicos.'},
 {label:'Solicitações',value:'solicitacoes',emoji:'📋',description:'Envie uma solicitação.'},
 {label:'Denúncias',value:'denuncias',emoji:'📢',description:'Relate um problema à equipe.'},
 {label:'Outros assuntos',value:'outros',emoji:'📩',description:'Converse com a equipe.'}
];
function state(g){g.neroModules??={};const m=g.neroModules;for(const k of ['panels','meetings','courses','tickets'])m[k]??={};m.audit??=[];return m;}
function config(raw={}){
 return {...raw,title:raw.title||'Central de Atendimento',description:raw.description||'Olá! Seja bem-vindo(a) à nossa central de atendimento.\nSelecione uma opção e aguarde nossa equipe.',rules:raw.rules??'• Aguarde a resposta da equipe.\n• Evite marcações desnecessárias.\n• Não envie senhas ou documentos pessoais.',footer:raw.footer??'Nero Bot • Sistema de Atendimento',color:raw.color||'#DC2626',bannerUrl:raw.bannerUrl||null,iconUrl:raw.iconUrl||null,roleIds:Array.isArray(raw.roleIds)?raw.roleIds:raw.roleId?[raw.roleId]:[],options:(Array.isArray(raw.options)&&raw.options.length?raw.options:defaults).map(x=>({...x})),limit:raw.limit??1,deleteDelay:[0,5,10,30].includes(raw.deleteDelay)?raw.deleteDelay:5,mentionStaff:raw.mentionStaff??false,allowClaim:raw.allowClaim??true,allowOwnerClose:raw.allowOwnerClose??false,allowTransfer:raw.allowTransfer??true,requestRating:raw.requestRating??false,opening:raw.opening||'Seu atendimento foi aberto. Aguarde nossa equipe.',logChannelId:raw.logChannelId||null, inactivity:raw.inactivity??0};
}
const opt=(c,key)=>c.options.find(o=>o.value===key);
function save(m,event,actor,ref){m.audit.push({kind:'support',event,actor,ref,at:Date.now()});store.save();}
function color(c){return Number.parseInt(c.color.slice(1),16);}
function addBanner(c,files,cfg){const name='nero-support.gif';let url=cfg.bannerUrl;if(!url){url='attachment://'+name;files.push(new D.AttachmentBuilder(require('node:path').join(__dirname,'..','assets',name),{name}));}c.addMediaGalleryComponents(new D.MediaGalleryBuilder().addItems(new D.MediaGalleryItemBuilder().setURL(url).setDescription('Central de Atendimento')));}
function payload(c,files=[],privatePanel=false){return {components:[c],files,flags:V|(privatePanel?E:0),allowedMentions:mentions};}
function supportPanel(guild,raw={}){
 const cfg=config(raw),c=new D.ContainerBuilder().setAccentColor(color(cfg)),files=[];
 addBanner(c,files,cfg);
 const intro='## 🛡️ '+safe(cfg.title)+'\n'+safe(cfg.description);
 const icon=cfg.iconUrl||guild?.iconURL({extension:'png',size:128});
 if(icon)c.addSectionComponents(new D.SectionBuilder().addTextDisplayComponents(td(intro)).setThumbnailAccessory(new D.ThumbnailBuilder().setURL(icon)));else c.addTextDisplayComponents(td(intro));
 if(cfg.rules)c.addTextDisplayComponents(td('**⚠️ Informações importantes**\n'+safe(cfg.rules)));
 c.addSeparatorComponents(sep()).addTextDisplayComponents(td('### 🎫 Abrir atendimento'));
 c.addActionRowComponents(row(new D.StringSelectMenuBuilder().setCustomId('n41:category:support').setPlaceholder('Selecione uma opção...').addOptions(cfg.options.map(o=>({label:o.label,value:o.value,description:o.description||undefined,emoji:o.emoji||undefined})))));
 c.addSeparatorComponents(sep()).addActionRowComponents(row(new D.ButtonBuilder().setCustomId('n41:settings:support').setEmoji('⚙️').setStyle(B.Secondary)));
 if(cfg.footer)c.addTextDisplayComponents(td('-# '+safe(cfg.footer)));
 return payload(c,files);
}
function roleMenu(key,placeholder){return new D.RoleSelectMenuBuilder().setCustomId('n41:'+key).setPlaceholder(placeholder).setMinValues(0).setMaxValues(10);}
function channelMenu(key,placeholder,type){return new D.ChannelSelectMenuBuilder().setCustomId('n41:'+key).setPlaceholder(placeholder).setMinValues(0).setMaxValues(1).addChannelTypes(type);}
function settings(raw,tab='main',selected=null){
 const cfg=config(raw),c=new D.ContainerBuilder().setAccentColor(color(cfg)).addTextDisplayComponents(td('## ⚙️ Configurações de atendimento'));
 const roles=cfg.roleIds.map(x=>'<@&'+x+'>').join(', ')||'Não configurados';
 if(tab==='main'){
  c.addTextDisplayComponents(td('**Atendentes:** '+roles+'\n**Categoria:** '+(cfg.categoryId?'<#'+cfg.categoryId+'>':'Sem categoria')+'\n**Opções:** '+cfg.options.length+'\n**Excluir após fechar:** '+cfg.deleteDelay+'s'));
  c.addActionRowComponents(row(b('visual:support','Visual'),b('channels:support','Canais e cargos'),b('options:support','Opções'),b('general:support','Geral')));
  c.addActionRowComponents(row(b('settingsrefresh:support','Atualizar painel',B.Primary)));
 }else if(tab==='visual'){
  c.addTextDisplayComponents(td('**Título:** '+safe(cfg.title)+'\n**Cor:** '+cfg.color+'\n**Banner:** '+(cfg.bannerUrl?'Personalizado':'Padrão Nero')+'\n**Emblema:** '+(cfg.iconUrl?'Personalizado':'Servidor')));
  c.addActionRowComponents(row(b('editText:support','Título e textos'),b('editImages:support','Banner, emblema e cor'),b('editOpening:support','Mensagem inicial')));
 }else if(tab==='channels'){
  c.addTextDisplayComponents(td('**Atendentes:** '+roles+'\n**Categoria de abertura:** '+(cfg.categoryId?'<#'+cfg.categoryId+'>':'Sem categoria')+'\n**Logs opcionais:** '+(cfg.logChannelId?'<#'+cfg.logChannelId+'>':'Desativados')+'\n-# Logs registram somente ações, não conversas.'));
  c.addActionRowComponents(row(roleMenu('settingsrole:support','Cargos de atendimento')));
  c.addActionRowComponents(row(channelMenu('settingschannel:support','Categoria dos tickets',D.ChannelType.GuildCategory)));
  c.addActionRowComponents(row(channelMenu('settingslog:support','Canal privado de logs',D.ChannelType.GuildText)));
 }else if(tab==='options'){
  c.addTextDisplayComponents(td(cfg.options.map(o=>(o.emoji||'•')+' **'+safe(o.label)+'**').join('\n')));
  c.addActionRowComponents(row(new D.StringSelectMenuBuilder().setCustomId('n41:selectOption:support').setPlaceholder('Escolha uma opção para editar').addOptions(cfg.options.map(o=>({label:o.label,value:o.value,emoji:o.emoji||undefined})))));
  if(cfg.options.length<25)c.addActionRowComponents(row(b('addOption:support','Criar opção',B.Success)));
 }else if(tab==='option'){
  const o=opt(cfg,selected);if(!o)throw Error('Opção removida.');
  c.addTextDisplayComponents(td((o.emoji||'🎫')+' **'+safe(o.label)+'**\n'+safe(o.description)+'\nCargos: '+(o.roleIds?.length?o.roleIds.map(x=>'<@&'+x+'>').join(', '):'Padrão')+'\nCategoria: '+(o.categoryId?'<#'+o.categoryId+'>':'Padrão')));
  c.addActionRowComponents(row(b('editOption:support:'+o.value,'Editar nome e emoji'),b('removeOption:support:'+o.value,'Remover opção',B.Danger)));
  c.addActionRowComponents(row(roleMenu('optionRoles:support:'+o.value,'Cargos específicos ou padrão')));
  c.addActionRowComponents(row(channelMenu('optionChannel:support:'+o.value,'Categoria específica ou padrão',D.ChannelType.GuildCategory)));
 }else if(tab==='general'){
  c.addTextDisplayComponents(td('**Limite por membro:** '+cfg.limit+'\n**Excluir após:** '+cfg.deleteDelay+'s\n**Inatividade:** '+(cfg.inactivity?cfg.inactivity+' horas':'Desativada')+'\n**Mencionar equipe:** '+(cfg.mentionStaff?'Sim':'Não')+'\n**Assumir ticket:** '+(cfg.allowClaim?'Sim':'Não')+'\n**Solicitante pode fechar:** '+(cfg.allowOwnerClose?'Sim':'Não')+'\n**Transferência:** '+(cfg.allowTransfer?'Sim':'Não')+'\n**Avaliação por DM:** '+(cfg.requestRating?'Sim':'Não')));
  c.addActionRowComponents(row(b('editGeneral:support','Limites e tempos'),b('toggleMention:support','Menções'),b('toggleClaim:support','Assumir')));
  c.addActionRowComponents(row(b('toggleOwner:support','Fechar pelo membro'),b('toggleTransfer:support','Transferência'),b('toggleRating:support','Avaliação')));
 }
 if(tab!=='main')c.addActionRowComponents(row(b(tab==='option'?'options:support':'settings:support','Voltar'),b('settingsrefresh:support','Atualizar painel',B.Primary)));
 return payload(c,[],true);
}
function modal(key,title,fields){
 const m=new D.ModalBuilder().setCustomId('n41:'+key).setTitle(title);
 for(const [name,label,max,value='',required=true,paragraph=false] of fields){const t=new D.TextInputBuilder().setCustomId(name).setLabel(label).setMaxLength(max).setRequired(required).setStyle(paragraph?D.TextInputStyle.Paragraph:D.TextInputStyle.Short);if(value!==null&&value!==undefined&&value!=='')t.setValue(String(value));m.addComponents(row(t));}return m;
}
function url(v){if(!v)return null;const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use um link HTTPS válido.');return v;}
function integer(v,min,max){if(!/^\d+$/.test(v)||Number(v)<min||Number(v)>max)throw Error('Valor numérico inválido.');return Number(v);}
async function validateRoles(i,ids){for(const id of ids){const role=await i.guild.roles.fetch(id).catch(()=>null);if(!role||role.id===i.guildId)throw Error('Selecione cargos válidos, diferentes de @everyone.');}return ids;}
async function validateChannel(i,id,type){if(!id)return null;const ch=await i.guild.channels.fetch(id).catch(()=>null);if(!ch||ch.guildId!==i.guildId||ch.type!==type)throw Error('Canal ou categoria inválida.');return ch;}
async function updateSupport(i,cfg){const ch=await i.guild.channels.fetch(cfg.channelId),msg=await ch.messages.fetch(cfg.messageId);if(msg.author.id!==i.client.user.id)throw Error('Painel inválido.');await msg.edit({...supportPanel(i.guild,cfg),attachments:[]});}
async function publish(i,m){requireAdmin(i);await defer(i);const ch=i.channel;if(!ch?.send||ch.guildId!==i.guildId||ch.type!==D.ChannelType.GuildText)throw Error('Use um canal de texto do servidor.');const old=config(m.panels.support);if(old.channelId===ch.id&&old.messageId){const msg=await ch.messages.fetch(old.messageId).catch(()=>null);if(msg?.author.id===i.client.user.id){await msg.edit({...supportPanel(i.guild,old),attachments:[]});m.panels.support=old;store.save();return reply(i,'Painel atualizado. Configure pela engrenagem.');}}
 const msg=await ch.send(supportPanel(i.guild,old));m.panels.support={...old,channelId:ch.id,messageId:msg.id};save(m,'panel',i.user.id,msg.id);return reply(i,'Painel publicado! Configure pela engrenagem.');
}
async function settingsAction(i,m,action,a){
 requireAdmin(i);if(!m.panels.support)throw Error('Publique o painel primeiro.');const c=config(m.panels.support);let tab='main',selected=a;
 const show=(tab,selected)=>i.isModalSubmit()||!i.message?.flags?.has(E)?i.reply(settings(c,tab,selected)):i.update({...settings(c,tab,selected),flags:V});
 if(action==='settings'||['visual','channels','options','general'].includes(action))return show(action==='settings'?'main':action);
 if(action==='selectOption')return show('option',i.values[0]);
 if(action==='settingsrefresh'){await defer(i);await updateSupport(i,c);return reply(i,'Painel público atualizado.');}
 if(action==='editText')return i.showModal(modal('saveText:support','Editar painel',[['title','Título',100,c.title],['description','Descrição',900,c.description,true,true],['rules','Regras',700,c.rules,false,true],['footer','Rodapé',100,c.footer,false]]));
 if(action==='editImages'||action==='settingsbanner')return i.showModal(modal('saveImages:support','Imagens e cor',[['banner','URL HTTPS do banner (opcional)',500,c.bannerUrl,false],['icon','URL HTTPS do emblema (opcional)',500,c.iconUrl,false],['color','Cor hexadecimal',7,c.color]]));
 if(action==='editOpening')return i.showModal(modal('saveOpening:support','Mensagem inicial',[['opening','Mensagem exibida no ticket',700,c.opening,true,true]]));
 if(action==='editGeneral')return i.showModal(modal('saveGeneral:support','Limites e tempos',[['limit','Tickets por membro (1 a 5)',1,c.limit],['delay','Excluir após 0, 5, 10 ou 30 segundos',2,c.deleteDelay],['inactivity','Inatividade em horas (0 = desligado)',3,c.inactivity]]));
 if(action==='addOption'||action==='editOption'){const o=action==='editOption'?opt(c,a):null;if(action==='editOption'&&!o)throw Error('Opção removida.');return i.showModal(modal('saveOption:support:'+(o?.value||'new'),'Editar opção',[['label','Nome',80,o?.label],['emoji','Emoji Unicode (opcional)',32,o?.emoji,false],['description','Descrição',100,o?.description,false]]));}
 if(action==='saveText'){c.title=field(i,'title');c.description=field(i,'description');c.rules=field(i,'rules');c.footer=field(i,'footer');if(!c.title||!c.description)throw Error('Preencha título e descrição.');tab='visual';}
 else if(action==='saveImages'){const hex=field(i,'color');if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Use uma cor como #DC2626.');c.bannerUrl=url(field(i,'banner'));c.iconUrl=url(field(i,'icon'));c.color=hex;tab='visual';}
 else if(action==='settingssavebanner'){c.bannerUrl=url(field(i,'url'));tab='visual';}
 else if(action==='saveOpening'){c.opening=field(i,'opening');if(!c.opening)throw Error('Mensagem vazia.');tab='visual';}
 else if(action==='settingsrole'){c.roleIds=await validateRoles(i,i.values);c.roleId=c.roleIds[0]||null;tab='channels';}
 else if(action==='settingschannel'){c.categoryId=(await validateChannel(i,i.values[0],D.ChannelType.GuildCategory))?.id||null;tab='channels';}
 else if(action==='settingslog'){const ch=await validateChannel(i,i.values[0],D.ChannelType.GuildText);if(ch&&ch.permissionsFor(i.guild.roles.everyone)?.has(P.ViewChannel))throw Error('Escolha um canal de logs privado.');c.logChannelId=ch?.id||null;tab='channels';}
 else if(action==='saveGeneral'){c.limit=integer(field(i,'limit'),1,5);const delay=integer(field(i,'delay'),0,30);if(![0,5,10,30].includes(delay))throw Error('Escolha 0, 5, 10 ou 30 segundos.');c.deleteDelay=delay;c.inactivity=integer(field(i,'inactivity'),0,168);tab='general';}
 else if(action.startsWith('toggle')){const k={toggleMention:'mentionStaff',toggleClaim:'allowClaim',toggleOwner:'allowOwnerClose',toggleTransfer:'allowTransfer',toggleRating:'requestRating'}[action];if(!k)throw Error('Configuração inválida.');c[k]=!c[k];tab='general';}
 else if(action==='saveOption'){const label=field(i,'label'),emoji=field(i,'emoji'),description=field(i,'description');if(!label)throw Error('Informe um nome.');if(emoji&&(!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji)||[...new Intl.Segmenter('pt',{granularity:'grapheme'}).segment(emoji)].length!==1))throw Error('Use um emoji Unicode, como 🎫.');let o=opt(c,a);if(a==='new'){if(c.options.length>=25)throw Error('Limite de 25 opções.');o={value:id()};c.options.push(o);}if(!o)throw Error('Opção removida.');Object.assign(o,{label,emoji:emoji||null,description});tab='option';selected=o.value;}
 else if(action==='removeOption'){if(c.options.length<=1)throw Error('Mantenha pelo menos uma opção.');c.options=c.options.filter(o=>o.value!==a);tab='options';}
 else if(action==='optionRoles'||action==='optionChannel'){const o=opt(c,a);if(!o)throw Error('Opção removida.');if(action==='optionRoles')o.roleIds=await validateRoles(i,i.values);else o.categoryId=(await validateChannel(i,i.values[0],D.ChannelType.GuildCategory))?.id||null;tab='option';}
 else throw Error('Configuração inválida.');
 m.panels.support=c;store.save();return show(tab,selected);
}
function ticketPanel(t,cfg){
 const c=new D.ContainerBuilder().setAccentColor(color(cfg)),files=[];addBanner(c,files,cfg);
 c.addTextDisplayComponents(td('## 🎫 Atendimento #'+t.id.slice(0,8)+'\n**Solicitante:** <@'+t.owner+'>\n**Categoria:** '+safe(t.categoryLabel||opt(cfg,t.category)?.label||'Geral')+'\n**Responsável:** '+(t.assignee?'<@'+t.assignee+'>':'Nenhum')+'\n**Situação:** '+(t.closing?'🔒 Encerrando':t.assignee?'🟡 Em atendimento':'🟢 Aguardando atendimento')+'\n**Assunto:** '+safe(t.subject||'—')));
 c.addTextDisplayComponents(td(safe(cfg.opening)));
 if(!t.closing&&!t.closed){const actions=[];if(cfg.allowClaim)actions.push(b((t.assignee?'release:':'claim:')+t.id,t.assignee?'Liberar ticket':'Assumir ticket',t.assignee?B.Secondary:B.Success));if(cfg.allowTransfer&&t.assignee)actions.push(b('transfer:'+t.id,'Transferir'));actions.push(b('close:'+t.id,'Fechar ticket',B.Danger));c.addSeparatorComponents(sep()).addActionRowComponents(row(...actions));}
 return payload(c,files);
}
const staff=(i,t)=>admin(i)||(t.roleIds||[t.roleId]).some(r=>i.member?.roles?.cache?.has(r));
const mayClose=(i,t,cfg)=>staff(i,t)||cfg.allowOwnerClose&&i.user.id===t.owner;
async function ticketLog(guild,cfg,t,event,actor){if(!cfg.logChannelId)return;try{const ch=await guild.channels.fetch(cfg.logChannelId);if(ch?.guildId!==guild.id||!ch.send||ch.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel))return;await ch.send({content:'**Ticket '+event+'** • #'+t.id.slice(0,8)+'\nSolicitante: <@'+t.owner+'>\nResponsável: '+(t.assignee?'<@'+t.assignee+'>':'—')+(actor?'\nAção por: <@'+actor+'>':''),allowedMentions:mentions});}catch(e){console.warn('[Atendimento logs]',e.message);}}
async function refreshTicket(guild,t,cfg){if(!t.messageId)return;try{const ch=await guild.channels.fetch(t.channelId),msg=await ch.messages.fetch(t.messageId);if(msg.author.id===guild.client.user.id)await msg.edit({...ticketPanel(t,cfg),attachments:[]});}catch(e){console.warn('[Atendimento painel]',e.message);}}
async function ticket(i,m,category){
 await defer(i);const cfg=config(m.panels.support),o=category?opt(cfg,category):null;if(category&&!o)throw Error('Opção removida. Abra novamente o painel.');
 const ids=o?.roleIds?.length?o.roleIds:cfg.roleIds;if(!ids.length)throw Error('A administração ainda precisa configurar os cargos de atendimento.');
 const roles=await validateRoles(i,ids);const subject=field(i,'subject');if(!subject)throw Error('Informe um assunto.');
 const key=i.guildId+':open:'+i.user.id;if(locks.has(key))throw Error('Abertura em andamento.');locks.add(key);
 try{if(Object.values(m.tickets).filter(t=>t.owner===i.user.id&&!t.closed).length>=cfg.limit)throw Error('Você atingiu seu limite de tickets.');
 const parent=(await validateChannel(i,o?.categoryId||cfg.categoryId,D.ChannelType.GuildCategory))?.id;
 const t={id:id(),owner:i.user.id,roleIds:roles,roleId:roles[0],createdAt:Date.now(),lastActivityAt:Date.now(),subject,category:category||null,categoryLabel:o?.label||'Geral',closed:false,assignee:null};
 const access=[P.ViewChannel,P.SendMessages,P.ReadMessageHistory];const ch=await i.guild.channels.create({name:'atendimento-'+t.id.slice(0,8),type:D.ChannelType.GuildText,parent,permissionOverwrites:[{id:i.guild.id,deny:[P.ViewChannel]},{id:t.owner,allow:access},...roles.map(id=>({id,allow:access})),{id:i.client.user.id,allow:[...access,P.ManageChannels,P.ManageRoles]}]});
 t.channelId=ch.id;try{const msg=await ch.send(ticketPanel(t,cfg));t.messageId=msg.id;if(cfg.mentionStaff)await ch.send({content:roles.map(r=>'<@&'+r+'>').join(' '),allowedMentions:{parse:[],roles}}).catch(()=>{});}catch(e){await ch.delete().catch(()=>{});throw e;}
 m.tickets[t.id]=t;save(m,'opened',i.user.id,t.id);await ticketLog(i.guild,cfg,t,'aberto',i.user.id);return reply(i,'Atendimento aberto: <#'+ch.id+'>.');
 }finally{locks.delete(key);}
}
async function beginClose(guild,m,t,cfg,actor){
 if(t.closed||t.closing)return false;t.closing=true;t.deleteAt=Date.now()+cfg.deleteDelay*1000;t.closedBy=actor||null;delete t.subject;save(m,'closing',actor,t.id);
 await refreshTicket(guild,t,cfg);return true;
}
async function deleteDue(guild,m,t,cfg){
 const key=guild.id+':delete:'+t.id;if(locks.has(key))return;locks.add(key);
 try{let ch;try{ch=await guild.channels.fetch(t.channelId);}catch(e){if(e.code!==10003)throw e;}
 if(ch){if(ch.guildId!==guild.id||ch.type!==D.ChannelType.GuildText||ch.id!==t.channelId)throw Error('Canal de ticket inválido.');await ch.delete('Nero: atendimento encerrado');}
 t.closed=true;t.closedAt=Date.now();t.closing=false;delete t.deleteAt;delete t.subject;save(m,'closed',t.closedBy,t.id);await ticketLog(guild,cfg,t,'encerrado',t.closedBy);if(cfg.requestRating)await sendRating(guild,t);
 }catch(e){t.deleteAt=Date.now()+30000;store.save();console.warn('[Atendimento exclusão; nova tentativa]',e.message);}finally{locks.delete(key);}
}
async function cleanup(guild){
 const m=state(store.get(guild.id)),cfg=config(m.panels.support);for(const t of Object.values(m.tickets)){
 if(t.closed)continue;
 if(t.closing&&t.deleteAt<=Date.now())await deleteDue(guild,m,t,cfg);
 else if(!t.closing&&cfg.inactivity&&Date.now()-(t.lastActivityAt||t.createdAt)>=cfg.inactivity*3600000)await beginClose(guild,m,t,cfg,null);
 }
}

async function sendRating(guild,t){
 try{const user=await guild.client.users.fetch(t.owner);await user.send({content:'Como foi seu atendimento no servidor '+safe(guild.name)+'? Avalie de 1 a 5. Não inclua dados pessoais.',components:[row(...[1,2,3,4,5].map(n=>new D.ButtonBuilder().setCustomId('nrate:'+guild.id+':'+t.id+':'+n).setLabel(String(n)).setStyle(B.Secondary)))],allowedMentions:mentions});}catch(e){console.warn('[Atendimento avaliação]',e.message);}
}
async function handleRating(i){
 const [,guildId,ticketId,value]=i.customId.split(':');const guild=i.client.guilds.cache.get(guildId);const rating=Number(value);
 if(!guild||!Number.isInteger(rating)||rating<1||rating>5){await i.reply({content:'Avaliação indisponível.'});return;}
 const m=state(store.get(guildId)),t=m.tickets[ticketId];
 if(!t?.closed||t.owner!==i.user.id||t.rating){await i.reply({content:'Avaliação indisponível ou já registrada.'});return;}
 t.rating=rating;save(m,'rated',i.user.id,t.id);await i.update({content:'Obrigado pela avaliação: '+rating+'/5.',components:[]});await ticketLog(guild,config(m.panels.support),t,'avaliado ('+rating+'/5)',i.user.id);
}

function install(client){
 client.on(D.Events.MessageCreate,msg=>{if(!msg.guild||msg.author.bot)return;const m=state(store.get(msg.guild.id)),t=Object.values(m.tickets).find(t=>t.channelId===msg.channelId&&!t.closed&&!t.closing);if(t){t.lastActivityAt=Date.now();store.save();}});
 let sweeping=false;const sweep=async()=>{if(sweeping)return;sweeping=true;try{for(const guild of client.guilds.cache.values())try{await cleanup(guild);}catch(e){console.warn('[Atendimento manutenção]',e.message);}}finally{sweeping=false;}};
 client.once(D.Events.ClientReady,()=>{sweep().catch(console.warn);setInterval(()=>sweep().catch(console.warn),1000).unref();});
}
async function handle(i){
 const slash=i.isChatInputCommand()&&i.commandName==='painelatendimento',custom=i.customId||'';if(!slash&&!custom.startsWith('n41:'))return false;
 try{const m=state(store.get(i.guildId));if(slash){await publish(i,m);return true;}
 const [action,k,a]=custom.slice(4).split(':');
 if(k==='support'){
  if(action==='category'&&i.isStringSelectMenu()){const cfg=config(m.panels.support),o=opt(cfg,i.values[0]);if(!o)throw Error('Opção removida.');await i.showModal(modal('create:support:'+o.value,o.label.slice(0,45),[['subject','Motivo do atendimento',200,'',true,true]]));}
  else if(action==='new'&&i.isButton())await i.showModal(modal('create:support','Atendimento',[['subject','Assunto',200]]));
  else if(action==='create'&&i.isModalSubmit())await ticket(i,m,a);
  else await settingsAction(i,m,action,a);
  return true;
 }
 if(!['claim','release','transfer','transferTo','close','confirmClose','cancelClose'].includes(action))throw Error('Sistema antigo desativado. Use os painéis atuais.');
 const t=m.tickets[k],cfg=config(m.panels.support);if(!t||t.closed||t.closing||t.channelId!==i.channelId)throw Error('Atendimento indisponível.');
 if(!t.messageId&&i.message?.author.id===i.client.user.id&&['claim','close'].includes(action)){t.messageId=i.message.id;store.save();}
 if(action==='close'){if(!mayClose(i,t,cfg))throw Error('Sem permissão para fechar.');await i.reply({content:'Confirma o encerramento? O canal será apagado'+(cfg.deleteDelay?' após '+cfg.deleteDelay+' segundos':' imediatamente')+'. A conversa não será arquivada pelo Nero.',components:[row(b('confirmClose:'+t.id+':'+i.user.id,'Confirmar',B.Danger),b('cancelClose:'+t.id+':'+i.user.id,'Cancelar'))],flags:E});return true;}
 if(action==='confirmClose'||action==='cancelClose'){if(a!==i.user.id||!mayClose(i,t,cfg))throw Error('Confirmação inválida.');if(action==='cancelClose'){await i.update({content:'Encerramento cancelado.',components:[]});return true;}
 await i.update({content:'Ticket encerrado. O canal será excluído.',components:[]});if(await beginClose(i.guild,m,t,cfg,i.user.id)&&cfg.deleteDelay===0)await deleteDue(i.guild,m,t,cfg);return true;}
 if(!staff(i,t))throw Error('Somente a equipe de atendimento.');
 if(action==='transfer'){if(!cfg.allowTransfer||!t.assignee||t.assignee!==i.user.id&&!admin(i))throw Error('Transferência indisponível.');await i.reply({content:'Selecione um atendente.',components:[row(new D.UserSelectMenuBuilder().setCustomId('n41:transferTo:'+t.id).setPlaceholder('Novo responsável').setMinValues(1).setMaxValues(1))],flags:E});return true;}
 await defer(i);if(t.closing||t.closed)throw Error('Ticket encerrado.');
 if(action==='claim'){if(!cfg.allowClaim||t.assignee)throw Error('Ticket já assumido ou opção desativada.');t.assignee=i.user.id;}
 else if(action==='release'){if(t.assignee!==i.user.id&&!admin(i))throw Error('Somente o responsável pode liberar.');t.assignee=null;}
 else if(action==='transferTo'){if(!cfg.allowTransfer||!t.assignee||t.assignee!==i.user.id&&!admin(i))throw Error('Transferência indisponível.');const member=await i.guild.members.fetch(i.values[0]);if(t.closing||t.closed)throw Error('Ticket encerrado.');if(member.user.bot||!(member.permissions.has(P.Administrator)||(t.roleIds||[t.roleId]).some(r=>member.roles.cache.has(r))))throw Error('Escolha um atendente autorizado.');t.assignee=member.id;}
 else throw Error('Ação inválida.');
 t.lastActivityAt=Date.now();save(m,action,i.user.id,t.id);await refreshTicket(i.guild,t,cfg);await ticketLog(i.guild,cfg,t,action,i.user.id);await reply(i,'Atendimento atualizado.');return true;
 }catch(e){console.warn('[Nero atendimento]',e.message);try{if(i.replied||i.deferred)await i.followUp({content:'⚠️ '+e.message,flags:E});else await reply(i,'⚠️ '+e.message);}catch{}return true;}
}
function dateValue(v){if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v))throw Error('Use AAAA-MM-DD HH:MM (Brasília).');const t=Date.parse(v.replace(' ','T')+':00-03:00');if(!Number.isFinite(t)||new Date(t-10800000).toISOString().slice(0,16).replace('T',' ')!==v||t<=Date.now())throw Error('Data futura inválida.');return t;}
function absenceApproved(g,user,when){const day=attendance.localDay(when,g.settings.timezone||'America/Sao_Paulo');return Object.values(g.justifications||{}).some(j=>j.userId===user&&j.status==='approved'&&(j.date===day||j.dates?.includes(day)));}
module.exports={commands,handle,handleRating,install,dateValue,absenceApproved,config,supportPanel,ticketPanel};
