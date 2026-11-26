'use strict';
const {SlashCommandBuilder,PermissionFlagsBits,ChannelType}=require('discord.js');
const neroModules=require('./nero-modules');
const meetingV2=require('./meeting-v2');
const welcome=require('./welcome');
const command=new SlashCommandBuilder().setName('painelbateponto').setDescription('Publicar a Central de Ponto por equipes e turnos')
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addChannelOption(o=>o.setName('canal').setDescription('Canal para publicar a Central de Ponto').addChannelTypes(ChannelType.GuildText).setRequired(false));
const justCommand=new SlashCommandBuilder().setName('paineljustificativas').setDescription('Publicar painel de justificativas no servidor')
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addChannelOption(o=>o.setName('canal').setDescription('Canal de publicação').addChannelTypes(ChannelType.GuildText).setRequired(false));
const monitorCommand=new SlashCommandBuilder().setName('fiscalizarponto')
 .setDescription('Consultar e fiscalizar cartões de ponto (somente responsáveis)');
const commands=[command,justCommand,monitorCommand,...neroModules.commands.filter(c=>c.name==='painelatendimento'),meetingV2.command,meetingV2.presenceCommand,welcome.command].map(c=>c.setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON());
const expected=['painelbateponto','paineljustificativas','fiscalizarponto','painelatendimento','painelreuniao','presenca','boasvindas'];
if(commands.length!==expected.length||expected.some(n=>!commands.some(c=>c.name===n))||commands.some(c=>c.default_member_permissions!=='8'))throw Error('Registro de comandos Nero inválido');
module.exports={commands};
