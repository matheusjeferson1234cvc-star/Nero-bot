'use strict';
const {Events,SlashCommandBuilder,PermissionFlagsBits,MessageFlags,EmbedBuilder}=require('discord.js');
const store=require('./store'),{normalizeWelcome}=require('./bot-config-schema');
const command=new SlashCommandBuilder().setName('boasvindas').setDescription('Consultar ou testar as mensagens de entrada e saída').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addStringOption(o=>o.setName('acao').setDescription('Ação').setRequired(true).addChoices({name:'Consultar configuração',value:'status'},{name:'Testar entrada',value:'join'},{name:'Testar saída',value:'leave'}));
function render(template,member,kind){
 const clean=x=>String(x??'').replaceAll('@','@\u200b');
 const values={membro:kind==='join'?'<@'+member.id+'>':clean(member.user.username),nome:clean(member.user.username),servidor:clean(member.guild.name),total:String(member.guild.memberCount)};
 return template.replace(/\{(membro|nome|servidor|total)\}/g,(_,k)=>values[k]);
}
async function send(member,kind,test=false){
 const cfg=normalizeWelcome(store.get(member.guild.id).settings.welcome)[kind];
 if(!cfg.enabled||!cfg.channelId){if(test)throw Error('Ative e configure o canal no site.');return;}
 const channel=await member.guild.channels.fetch(cfg.channelId);
 if(!channel?.isTextBased()||channel.guildId!==member.guild.id||!channel.send)throw Error('Canal inválido.');
 const embed=new EmbedBuilder().setTitle((test?'TESTE • ':'')+cfg.title).setDescription(render(cfg.message,member,kind)).setColor(parseInt(cfg.color.slice(1),16)).setFooter({text:'Nero • Entrada e saída'}).setTimestamp();
 if(cfg.showAvatar)embed.setThumbnail(member.user.displayAvatarURL());if(cfg.imageUrl)embed.setImage(cfg.imageUrl);
 await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
}
function install(client){
 for(const [event,kind] of [[Events.GuildMemberAdd,'join'],[Events.GuildMemberRemove,'leave']])client.on(event,member=>{if(member.user?.bot)return;send(member,kind).catch(e=>console.warn('[Nero entrada/saída]',e.message));});
}
async function handle(i){
 if(!i.isChatInputCommand()||i.commandName!=='boasvindas')return false;
 if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await i.reply({content:'Somente administração.',flags:MessageFlags.Ephemeral});return true;}
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{const action=i.options.getString('acao');const cfg=normalizeWelcome(store.get(i.guildId).settings.welcome);
 if(action==='status'){await i.editReply({content:['Entrada: '+(cfg.join.enabled?'ativa':'desativada')+(cfg.join.channelId?' • <#'+cfg.join.channelId+'>':''),'Saída: '+(cfg.leave.enabled?'ativa':'desativada')+(cfg.leave.channelId?' • <#'+cfg.leave.channelId+'>':''),'Configure as mensagens no site do Nero.'].join('\n'),allowedMentions:{parse:[]}});}
 else {const member=await i.guild.members.fetch(i.user.id);await send(member,action,true);await i.editReply('Mensagem de teste enviada ao canal configurado.');}
 }catch(e){await i.editReply('⚠️ '+e.message);}
 return true;
}
module.exports={command,install,handle,render};
