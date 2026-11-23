'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');

const bits={ManageChannels:1,ManageGuild:2,Administrator:4,ViewChannel:8,SendMessages:16,ReadMessageHistory:32,EmbedLinks:64};
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='discord.js')return {ChannelType:{GuildText:0,GuildCategory:4},PermissionFlagsBits:bits};
 return original.apply(this,arguments);
};
let logs;
try{logs=require('../src/log-setup');}finally{Module._load=original;}

class Collection extends Map{
 find(fn){for(const item of this.values())if(fn(item))return item;return undefined;}
 filter(fn){return new Collection([...this].filter(([,v])=>fn(v)));}
}
function mockGuild(){
 const channels=new Collection(),roles=new Collection();
 roles.set('everyone',{id:'everyone',permissions:{has:()=>false}});
 roles.set('managers',{id:'managers',permissions:{has:(x)=>x===bits.ManageGuild}});
 let count=0;
 const guild={
  roles:{everyone:roles.get('everyone'),cache:roles},
  client:{user:{id:'nero'}},
  members:{fetchMe:async()=>({permissions:{has:(p)=>p===bits.ManageChannels}})},
  channels:{
   fetch:async()=>channels,
   create:async(opts)=>{
    const channel={
     id:String(++count),name:opts.name,type:opts.type,parentId:opts.parent||null,
     permissionOverwrites:{edit:async()=>{}}
    };
    channels.set(channel.id,channel);return channel;
   }
  }
 };
 return {guild,channels};
}
function mockSettings(){
 return {logCategoryId:null,pointEventsChannelId:null,cancelLogChannelId:null,presenceLogChannelId:null,auditChannelId:null,
  shifts:Object.fromEntries(['manha','tarde','noite','madrugada'].map(k=>[k,{logChannelId:null}]))};
}
test('criar logs produz categoria privada e oito canais, preenchendo IDs',async()=>{
 const {guild,channels}=mockGuild(),settings=mockSettings();
 const out=await logs.createLogs(guild,settings);
 assert.equal(out.created.length,9);
 assert.equal(channels.size,9);
 assert.equal(settings.logCategoryId,out.categoryId);
 assert.equal(logs.status(settings).length,8);
 assert.ok(logs.status(settings).every(item=>item.id));
 for(const item of logs.status(settings)){
  const ch=channels.get(item.id);assert.equal(ch.parentId,out.categoryId);assert.equal(ch.type,0);
 }
});
test('repetir a criação reaproveita a categoria e canais existentes',async()=>{
 const {guild,channels}=mockGuild(),settings=mockSettings();
 await logs.createLogs(guild,settings);
 const before=logs.status(settings).map(item=>item.id);
 const next=await logs.createLogs(guild,settings);
 assert.equal(channels.size,9);
 assert.equal(next.created.length,0);
 assert.equal(next.reused.length,9);
 assert.deepEqual(logs.status(settings).map(item=>item.id),before);
});
test('sem Gerenciar Canais o bot não cria nada nem altera configuração',async()=>{
 const {guild,channels}=mockGuild(),settings=mockSettings();
 guild.members.fetchMe=async()=>({permissions:{has:()=>false}});
 await assert.rejects(()=>logs.createLogs(guild,settings),/Gerenciar Canais/);
 assert.equal(channels.size,0);
 assert.equal(settings.logCategoryId,null);
});

test('canais de logs possuem emojis e nomes legados para migração',()=>{
 const names=logs.LOG_CHANNELS.map(x=>x.name);
 assert.ok(names.includes('🌙・logs-noite'));
 assert.ok(names.includes('❌・logs-cancelamentos'));
 assert.ok(logs.LOG_CHANNELS.every(x=>x.legacyName));
 assert.match(logs.CATEGORY_NAME,/📁/);
});
