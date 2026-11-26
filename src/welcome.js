'use strict';
const {Events,SlashCommandBuilder,PermissionFlagsBits,MessageFlags,EmbedBuilder,AttachmentBuilder}=require('discord.js');
const store=require('./store'),{normalizeWelcome}=require('./bot-config-schema');
const D=require('discord.js');
const command=new SlashCommandBuilder().setName('boasvindas').setDescription('Abrir configuração de entrada e saída V2').setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
function render(template,member,kind){
 const clean=x=>String(x??'').replaceAll('@','@\u200b');
 const values={membro:kind==='join'?'<@'+member.id+'>':clean(member.user.username),nome:clean(member.user.username),servidor:clean(member.guild.name),total:String(member.guild.memberCount)};
 return template.replace(/\{(membro|nome|servidor|total)\}/g,(_,k)=>values[k]);
}
async function messagePayload(member,kind,cfg,test=false){
 const embed=new EmbedBuilder().setDescription(((test?'**PRÉVIA • TESTE**\n':'')+render(cfg.message,member,kind)).slice(0,4096)).setColor(cfg.color);
 const files=[];const embeds=[embed];
 if(!cfg.banner)embed.setTitle(cfg.title);
 if(cfg.banner){try{const card=await require('./welcome-card').welcomeCard(member,kind,cfg);files.push(new AttachmentBuilder(card,{name:'nero-member.png'}));embed.setImage('attachment://nero-member.png');}catch(e){console.warn('[Nero cartão]',e.message);embed.setTitle(cfg.title);if(cfg.avatar)embed.setThumbnail(member.user.displayAvatarURL());}}
 else if(cfg.avatar)embed.setThumbnail(member.user.displayAvatarURL());
 if(cfg.gif&&cfg.banner)embeds.push(new EmbedBuilder().setColor(cfg.color).setImage(cfg.gif));
 return {embeds,files,allowedMentions:{parse:[],users:kind==='join'&&!test?[member.id]:[]}};
}
async function send(member,kind,test=false){
 const cfg=normalizeWelcome(store.get(member.guild.id).settings.welcome)[kind];
 if(!cfg.enabled||!cfg.channelId){if(test)throw Error('Ative e configure o canal no Discord.');return;}
 const channel=await member.guild.channels.fetch(cfg.channelId);
 if(!channel?.isTextBased()||channel.guildId!==member.guild.id||!channel.send)throw Error('Canal inválido.');
 await channel.send(await messagePayload(member,kind,cfg,test));
}
async function grantJoinRole(member){
 const cfg=normalizeWelcome(store.get(member.guild.id).settings.welcome).join;
 if(!cfg.enabled||!cfg.roleId)return;
 const role=await member.guild.roles.fetch(cfg.roleId);
 if(!role||role.id===member.guild.id||role.managed||!role.editable||role.permissions.has(PermissionFlagsBits.Administrator))throw Error('Cargo de entrada indisponível ou não atribuível.');
 await member.roles.add(role,'Nero: cargo automático de entrada');
}
function install(client){
 client.on(Events.GuildMemberAdd,async member=>{if(member.user?.bot)return;try{await grantJoinRole(member);}catch(e){console.warn('[Nero cargo de entrada]',e.message);}try{await send(member,'join');}catch(e){console.warn('[Nero entrada]',e.message);}});
 client.on(Events.GuildMemberRemove,member=>{if(member.user?.bot)return;send(member,'leave').catch(e=>console.warn('[Nero saída]',e.message));});
}
const row=(...components)=>new D.ActionRowBuilder().addComponents(...components);
const button=(key,label,emoji,style=D.ButtonStyle.Secondary)=>new D.ButtonBuilder().setCustomId('wel:'+key).setLabel(label).setEmoji(emoji).setStyle(style);
const text=s=>new D.TextDisplayBuilder().setContent(s);
function panel(g,kind){
 const cfg=normalizeWelcome(g.settings.welcome),c=new D.ContainerBuilder().setAccentColor(0xdc2626);
 c.addTextDisplayComponents(text('## 👋 NERO | BOAS-VINDAS E SAÍDA V2'));
 if(!kind){c.addTextDisplayComponents(text('Escolha o sistema para configurar.\n👋 Entrada: '+(cfg.join.enabled?'Ativa':'Desativada')+'\n🚪 Saída: '+(cfg.leave.enabled?'Ativa':'Desativada')));c.addActionRowComponents(row(button('open:join','Boas-vindas','👋'),button('open:leave','Saída','🚪')));}
 else{const v=cfg[kind];c.addTextDisplayComponents(text('### '+(kind==='join'?'👋 Boas-vindas':'🚪 Saída')+'\n**Status:** '+(v.enabled?'Ativo':'Desativado')+'\n**Canal:** '+(v.channelId?'<#'+v.channelId+'>':'Não configurado')+'\n**Variáveis:** {membro}, {nome}, {servidor}, {total}\n**Título:** '+v.title+'\n**Cor:** '+v.color+' • Avatar: '+(v.avatar?'Sim':'Não')+' • Banner: '+(v.banner?'Sim':'Não')));
 c.addActionRowComponents(row(new D.ChannelSelectMenuBuilder().setCustomId('wel:channel:'+kind).setPlaceholder('📢 Selecionar canal').addChannelTypes(D.ChannelType.GuildText)));
 if(kind==='join'){c.addTextDisplayComponents(text('**Cargo automático:** '+(v.roleId?'<@&'+v.roleId+'>':'Não configurado')));c.addActionRowComponents(row(new D.RoleSelectMenuBuilder().setCustomId('wel:role:join').setPlaceholder('Selecionar cargo de entrada').setMinValues(0).setMaxValues(1)));}
 c.addActionRowComponents(row(button('toggle:'+kind,v.enabled?'Desativar':'Ativar','🔌'),button('message:'+kind,'Editar mensagem','✏️'),button('visual:'+kind,'Visual e GIF','🎨')));
 c.addActionRowComponents(row(button('avatar:'+kind,'Avatar','👤'),button('banner:'+kind,'Banner','🖼️'),button('preview:'+kind,'Prévia','👁️'),button('test:'+kind,'Enviar teste','📨')));
 c.addActionRowComponents(row(button('back','Voltar','↩️')));}
 return {components:[c],flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
}
function modal(kind,action,v){
 const m=new D.ModalBuilder().setCustomId('wel:save'+action+':'+kind).setTitle(action==='message'?'Editar mensagem':'Configurar visual');
 const field=(id,label,value,max,required=true,paragraph=false)=>{const t=new D.TextInputBuilder().setCustomId(id).setLabel(label).setStyle(paragraph?D.TextInputStyle.Paragraph:D.TextInputStyle.Short).setMaxLength(max).setRequired(required);if(value)t.setValue(value);return row(t);};
 if(action==='message')m.addComponents(field('title','Título',v.title,100),field('message','Mensagem (variáveis no painel)',v.message,1000,true,true));
 else m.addComponents(field('color','Cor hexadecimal',v.color,7),field('gif','Link HTTPS direto do GIF (opcional)',v.gif,500,false));
 return m;
}
function save(g,kind,patch,client){const cfg=normalizeWelcome(g.settings.welcome);g.settings.welcome=normalizeWelcome({...cfg,[kind]:{...cfg[kind],...patch}});g.welcomeEditedRevision=g.siteConfigRevision||0;store.save();require('./site-sync').requestUpdate(client);}
async function handle(i){
 const slash=i.isChatInputCommand()&&i.commandName==='boasvindas',custom=i.customId||'';
 if(!slash&&!custom.startsWith('wel:'))return false;
 if(!i.memberPermissions?.has(PermissionFlagsBits.Administrator)){await i.reply({content:'Somente administradores.',flags:MessageFlags.Ephemeral});return true;}
 try{const g=store.get(i.guildId);if(slash){await i.reply(panel(g));return true;}
 const [,action,kind]=custom.split(':');if(action==='back'){await i.update({...panel(g),flags:MessageFlags.IsComponentsV2});return true;}
 if(!['join','leave'].includes(kind))throw Error('Sistema inválido.');
 const v=normalizeWelcome(g.settings.welcome)[kind];
 if(action==='open'){await i.update({...panel(g,kind),flags:MessageFlags.IsComponentsV2});return true;}
 if(action==='message'||action==='visual'){await i.showModal(modal(kind,action,v));return true;}
 if(action==='preview'){await i.deferReply({flags:MessageFlags.Ephemeral});const m=await i.guild.members.fetch(i.user.id);await i.editReply(await messagePayload(m,kind,v,true));return true;}
 if(action==='test'){await i.deferReply({flags:MessageFlags.Ephemeral});await send(await i.guild.members.fetch(i.user.id),kind,true);await i.editReply('Mensagem de teste enviada ao canal.');return true;}
 let patch;
 if(action==='channel'){const c=await i.guild.channels.fetch(i.values[0]);if(!c||c.guildId!==i.guildId||c.type!==D.ChannelType.GuildText)throw Error('Canal inválido.');patch={channelId:c.id};}
 else if(action==='role'&&kind==='join'){const id=i.values[0];if(id){const role=await i.guild.roles.fetch(id);if(!role||role.id===i.guildId||role.managed||!role.editable||role.permissions.has(PermissionFlagsBits.Administrator))throw Error('Escolha um cargo atribuível abaixo do Nero e sem permissão de administrador.');}patch={roleId:id||null};}
 else if(action==='toggle')patch={enabled:!v.enabled};
 else if(action==='avatar'||action==='banner')patch={[action]:!v[action]};
 else if(action==='savemessage')patch={title:i.fields.getTextInputValue('title'),message:i.fields.getTextInputValue('message')};
 else if(action==='savevisual')patch={color:i.fields.getTextInputValue('color'),gif:i.fields.getTextInputValue('gif')||null};
 else throw Error('Ação inválida.');
 save(g,kind,patch,i.client);
 if(i.isModalSubmit())await i.reply(panel(g,kind));else await i.update({...panel(g,kind),flags:MessageFlags.IsComponentsV2});
 }catch(e){if(i.deferred)await i.editReply('⚠️ '+e.message);else if(!i.replied)await i.reply({content:'⚠️ '+e.message,flags:MessageFlags.Ephemeral});}
 return true;
}
module.exports={command,install,handle,render};
