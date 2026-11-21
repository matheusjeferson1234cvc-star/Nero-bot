'use strict';
const {SlashCommandBuilder,PermissionFlagsBits,ChannelType}=require('discord.js');
const commands=[
 ['painelregistro','🪪 Publicar o Registro RP'],
 ['painelrecrutamento','📋 Publicar o Recrutamento RP'],
 ['painelgestao','👑 Publicar Gestão e Advertências RP'],
 ['painelbateponto','⏱️ Publicar Bate-ponto de equipe RP'],
].map(([name,desc])=>new SlashCommandBuilder().setName(name).setDescription(desc)
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addStringOption(opt=>opt.setName('modulo').setDescription('Organização ou Polícia?').setRequired(true).addChoices({name:'👑 Organização',value:'org'},{name:'🚔 Polícia',value:'policia'}))
 .addChannelOption(opt=>opt.setName('canal').setDescription('Canal de publicação (opcional)').addChannelTypes(ChannelType.GuildText)).toJSON());
const byCommand=Object.freeze({painelregistro:'registro',painelrecrutamento:'recrutamento',painelgestao:'gestao',painelbateponto:'bateponto'});
module.exports={commands,byCommand};
