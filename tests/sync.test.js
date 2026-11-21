'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const { quickPanelType } = require('../src/panel-routing');

// Stub mínimo para carregar o esquema completo sem instalar discord.js durante os testes estáticos.
class Builder {
 constructor(){this.data={};}
 setName(v){this.data.name=v;return this;}
 setDescription(v){this.data.description=v;return this;}
 setDefaultMemberPermissions(v){this.data.default_member_permissions=v;return this;}
 addStringOption(cb){const o=new Builder();cb(o);(this.data.options??=[]).push(o.data);return this;}
 addChannelOption(cb){const o=new Builder();cb(o);(this.data.options??=[]).push(o.data);return this;}
 setRequired(v){this.data.required=v;return this;}
 addChannelTypes(...v){this.data.channel_types=v;return this;}
 addChoices(...v){this.data.choices=v;return this;}
 toJSON(){return this.data;}
}
const loader=Module._load;
let syncGuildCommands;
try {
 Module._load=function(n,parent,...args){
   if(n==='discord.js')return {SlashCommandBuilder:Builder,PermissionFlagsBits:{ManageGuild:32},ChannelType:{GuildText:0}};
   return loader.call(this,n,parent,...args);
 };
 delete require.cache[require.resolve('../src/commands')];
 delete require.cache[require.resolve('../src/sync-commands')];
 syncGuildCommands=require('../src/sync-commands').syncGuildCommands;
} finally{Module._load=loader;}

test('atalhos apontam para os painéis corretos e alias funciona',()=>{
 assert.equal(quickPanelType('painelbateponto'),'plantao');
 assert.equal(quickPanelType('painelregistro'),'registro');
 assert.equal(quickPanelType('painelrecrutamento'),'recrutamento');
 assert.equal(quickPanelType('penielrecrutamento'),'recrutamento');
 assert.equal(quickPanelType('gestão'),'gestao');
 assert.equal(quickPanelType('config'),null);
});
test('o sincronizador substitui comandos do aplicativo em cada servidor',async()=>{
 let sent;
 const logger={log(){},error(){}};
 const guild={name:'Teste',id:'1234',commands:{set:async definitions=>{sent=definitions;return {size:definitions.length};}}};
 assert.equal(await syncGuildCommands(guild,undefined,logger),true);
 assert.equal(sent.length,7);
 assert.equal(sent[2].name,'painelbateponto');
});
test('falha de API retorna false e gera log, sem derrubar o bot',async()=>{
 let logged=false;
 const guild={name:'Teste',id:'5678',commands:{set:async()=>{throw new Error('sem permissões');}}};
 assert.equal(await syncGuildCommands(guild,undefined,{log(){},error(){logged=true;}}),false);
 assert.equal(logged,true);
});
