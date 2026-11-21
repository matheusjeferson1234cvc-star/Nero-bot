'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
class Builder {
  constructor(){ this.data={}; }
  setName(x){ this.data.name=x;return this; }
  setDescription(x){ this.data.description=x;return this; }
  setDefaultMemberPermissions(x){ this.data.default_member_permissions=x;return this; }
  addStringOption(cb){ const option=new Builder();cb(option);(this.data.options??=[]).push(option.data);return this; }
  addChannelOption(cb){ const option=new Builder();cb(option);(this.data.options??=[]).push(option.data);return this; }
  addChoices(...choices){this.data.choices=choices;return this;}
  addChannelTypes(...types){this.data.channel_types=types;return this;}
  setRequired(required){this.data.required=required;return this;}
  toJSON(){return this.data;}
}
const original=Module._load;
let commands;
try{
  Module._load=function(request,parent,...args){
    if(request==='discord.js')return {SlashCommandBuilder:Builder,PermissionFlagsBits:{ManageGuild:32},ChannelType:{GuildText:0}};
    return original.call(this,request,parent,...args);
  };
  delete require.cache[require.resolve('../src/commands')];
  commands=require('../src/commands').commands;
}finally{Module._load=original;}

test('painéis principais e atalhos são registrados no Discord',()=>{
 assert.deepEqual(commands.map(c=>c.name),[
  'painel','config','painelbateponto','painelregistro','painelrecrutamento','penielrecrutamento','gestão'
 ]);
 assert.equal(commands[0].options.length,3);
 assert.equal(commands[1].options.length,1);
 assert.ok(commands.slice(2).every(c=>c.options.length===2));
 assert.ok(commands.slice(2).every(c=>c.options[0].name==='modulo' && c.options[0].required===true));
 assert.ok(commands.slice(2).every(c=>c.options[1].name==='canal' && c.options[1].required===false));
 assert.ok(commands.every(c=>c.default_member_permissions===32));
});
