'use strict';
// Registro manual opcional. O bot já sincroniza os comandos automaticamente ao iniciar.
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { syncGuildCommands } = require('./sync-commands');
const token=process.env.DISCORD_TOKEN;
if(!token || token==='COLE_SEU_TOKEN_AQUI') {
 console.error('❌ Preencha DISCORD_TOKEN no .env antes de executar.');
 process.exit(1);
}
const client=new Client({intents:[GatewayIntentBits.Guilds]});
client.once(Events.ClientReady,async()=>{
 let errors=0;
 try {
   for(const guild of client.guilds.cache.values())if(!(await syncGuildCommands(guild)))errors++;
   console.log(`Registro concluído: ${client.guilds.cache.size-errors}/${client.guilds.cache.size} servidor(es).`);
 } finally {
   client.destroy();
   if(errors) process.exitCode=1;
 }
});
client.login(token).catch(e=>{console.error('❌ Login falhou:',e.message);process.exitCode=1;});
