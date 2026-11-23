'use strict';
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const CATEGORY_NAME = 'LOG BATE-PONTO';
const LOG_CHANNELS = Object.freeze([
  { key: 'pointEventsChannelId', name: 'logs-bate-ponto', label: 'Eventos do ponto' },
  { key: 'manha', name: 'logs-manha', label: 'Cartões da manhã' },
  { key: 'tarde', name: 'logs-tarde', label: 'Cartões da tarde' },
  { key: 'noite', name: 'logs-noite', label: 'Cartões da noite' },
  { key: 'madrugada', name: 'logs-madrugada', label: 'Cartões da madrugada' },
  { key: 'cancelLogChannelId', name: 'logs-cancelamentos', label: 'Cancelamentos' },
  { key: 'presenceLogChannelId', name: 'logs-presenca', label: 'Presença' },
  { key: 'auditChannelId', name: 'auditoria-geral', label: 'Auditoria geral' }
]);

function channelId(settings, key) {
  return ['manha', 'tarde', 'noite', 'madrugada'].includes(key)
    ? settings.shifts[key].logChannelId
    : settings[key] || null;
}
function setChannelId(settings, key, id) {
  if (['manha', 'tarde', 'noite', 'madrugada'].includes(key)) settings.shifts[key].logChannelId = id;
  else settings[key] = id;
}
function status(settings) {
  return LOG_CHANNELS.map(item => ({...item, id: channelId(settings, item.key)}));
}
function permissions(guild) {
  const perms = PermissionFlagsBits;
  const allow = [perms.ViewChannel, perms.ReadMessageHistory];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [perms.ViewChannel] },
    { id: guild.client.user.id, allow: [...allow, perms.SendMessages, perms.EmbedLinks, perms.ManageChannels] }
  ];
  const admins = guild.roles.cache.filter(role =>
    role.id !== guild.roles.everyone.id &&
    (role.permissions.has(perms.Administrator) || role.permissions.has(perms.ManageGuild))
  );
  for (const role of admins.values()) {
    if (overwrites.length >= 95) break;
    overwrites.push({id: role.id, allow, deny: [perms.SendMessages]});
  }
  return overwrites;
}
async function createLogs(guild, settings) {
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw Error('O Nero precisa da permissão Gerenciar Canais para criar os logs.');
  }
  let channels = await guild.channels.fetch();
  let category = channels.get(settings.logCategoryId) || null;
  if (category?.type !== ChannelType.GuildCategory) category = null;
  if (!category) category = channels.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME);
  const created = [], reused = [];
  if (!category) {
    category = await guild.channels.create({
      name: CATEGORY_NAME, type: ChannelType.GuildCategory,
      permissionOverwrites: permissions(guild),
      reason: 'Nero Bot V4: estrutura privada dos logs de bate-ponto'
    });
    created.push(CATEGORY_NAME);
  } else {
    // Uma categoria já existente nunca deve expor registros de funcionários a @everyone.
    await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, {
      reason: 'Proteger logs privados do Nero Bot'
    });
    await category.permissionOverwrites.edit(guild.client.user.id,
      { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, EmbedLinks: true }, {
        reason: 'Permitir registro de logs pelo Nero Bot'
      });
    reused.push(CATEGORY_NAME);
  }
  channels = await guild.channels.fetch();
  const result = {};
  for (const item of LOG_CHANNELS) {
    let channel = channels.find(c =>
      c.type === ChannelType.GuildText && c.parentId === category.id && c.name === item.name
    );
    if (!channel) {
      channel = await guild.channels.create({
        name: item.name, type: ChannelType.GuildText, parent: category.id,
        reason: 'Nero Bot V4: ' + item.label
      });
      created.push('#' + item.name);
    } else {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, {
        reason: 'Manter logs privados do Nero Bot'
      });
      reused.push('#' + item.name);
    }
    result[item.key] = channel.id;
    channels.set(channel.id, channel);
  }
  // Atualizar o banco somente quando todos os canais tiverem sido verificados.
  settings.logCategoryId = category.id;
  for (const item of LOG_CHANNELS) setChannelId(settings, item.key, result[item.key]);
  return { categoryId: category.id, created, reused, channels: status(settings) };
}

module.exports = {CATEGORY_NAME, LOG_CHANNELS, status, createLogs};
