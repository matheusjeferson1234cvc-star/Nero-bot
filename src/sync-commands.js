'use strict';
const { commands } = require('./commands');

// Substitui apenas os slash commands *deste aplicativo* em cada servidor.
// A operação é repetível: evita comandos velhos e funciona quando o bot entra num novo servidor.
async function syncGuildCommands(guild, definitions = commands, logger = console) {
  try {
    const registered = await guild.commands.set(definitions);
    logger.log(`✅ [${guild.name} / ${guild.id}] ${registered.size ?? registered.length ?? definitions.length} comandos sincronizados.`);
    return true;
  } catch (error) {
    logger.error(`❌ [${guild.name} / ${guild.id}] Não consegui registrar slash commands: ${error.message}`);
    return false;
  }
}
module.exports = { syncGuildCommands };
