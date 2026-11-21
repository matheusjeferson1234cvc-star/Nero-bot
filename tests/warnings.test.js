'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ch-attendance-test-'));process.env.DATA_DIR=temp;
const store=require('../src/store'),core=require('../src/core');
// Unit tests use isolated builders because the Discord package is installed only on Discloud.
const Module=require('node:module'),original=Module._load;
class Fake{constructor(){this.components=[];this.fields=[]}setAccentColor(){return this}setColor(){return this}setTitle(){return this}setDescription(){return this}setContent(){return this}setTimestamp(){return this}setFooter(){return this}setCustomId(){return this}setLabel(){return this}setStyle(){return this}addFields(){return this}addActionRowComponents(){return this}addTextDisplayComponents(){return this}addMediaGalleryComponents(){return this}addComponents(){return this}}
Module._load=function(name){if(name==='discord.js')return {ContainerBuilder:Fake,TextDisplayBuilder:Fake,MediaGalleryBuilder:Fake,MediaGalleryItemBuilder:Fake,EmbedBuilder:Fake,ActionRowBuilder:Fake,ButtonBuilder:Fake,StringSelectMenuBuilder:Fake,RoleSelectMenuBuilder:Fake,ChannelSelectMenuBuilder:Fake,AttachmentBuilder:Fake,ButtonStyle:{Secondary:2,Primary:1,Success:3,Danger:4},MessageFlags:{IsComponentsV2:32768,Ephemeral:64},ChannelType:{GuildText:0}};return original.apply(this,arguments)};
let runtime;try{runtime=require('../src/attendance-runtime')}finally{Module._load=original};
const timestamp=Date.parse('2026-11-11T15:00:00Z');
test('bot só adverte após autorização explícita do site, sem duplicar ao repetir sincronização',async()=>{
 const guildId='123456789012345678',memberId='222222222222222222';
 const g=store.get(guildId);g.settings.shifts.manha.roleIds=['shift-role'];
 g.attendance.enabledAfterDate='2026-11-08';g.settings.justifications.autoWarnings=true;
 g.settings.justifications.warningChannelId='chan';g.settings.justifications.warningRoles=['warn-1','warn-2','warn-3'];
 g.siteOff={data:{weekly:{all:[0]},dates:[]},syncedAt:timestamp};
 for(const date of ['2026-11-09','2026-11-10'])g.attendance.rosters[date]={date,shifts:{manha:[memberId],tarde:[],noite:[],madrugada:[]}};
 const roles=new Set(),sent=[];
 const m={id:memberId,roles:{cache:{has:id=>roles.has(id)},add:async(id)=>{roles.add(id)},remove:async(id)=>{roles.delete(id)}},send:async(v)=>{sent.push(v)}};
 const guild={id:guildId,members:{cache:new Map([[memberId,m]]),fetch:async()=>m},channels:{fetch:async()=>({send:async(v)=>sent.push(v)})}};
 const first=await runtime.runGuild(guild,timestamp);
 assert.equal(first.processed,2);assert.equal(Object.keys(g.attendance.warnings).length,0);
 const candidate={id:`${memberId}:manha:2026-11-10`,userId:memberId,shift:'manha',date:'2026-11-10',evidenceDays:['2026-11-09','2026-11-10']};
 const authorized=await runtime.applySiteApprovals(guild,g,[candidate],timestamp);assert.equal(authorized.applied,1);assert.equal(Object.keys(g.attendance.warnings).length,1);
 assert(roles.has('warn-1'));assert.equal(g.attendance.warningLevels[memberId],1);
 assert.equal(g.attendance.days[`2026-11-09:${memberId}:manha`].status,'falta');
 const repeat=await runtime.runGuild(guild,timestamp);assert.equal(repeat.processed,0);
 const duplicate=await runtime.applySiteApprovals(guild,g,[candidate],timestamp);assert.equal(duplicate.applied,0);assert.equal(Object.keys(g.attendance.warnings).length,1);
 const w=Object.values(g.attendance.warnings)[0];await runtime.revoke(guild,g,w.id,'admin');
 assert.equal(g.attendance.warnings[w.id].status,'revoked');assert(!roles.has('warn-1'));
});
test('presença é acompanhada mesmo com advertência automática desativada',async()=>{
 const id='999999999999999999',user='333333333333333333',g=store.get(id),now=timestamp;
 g.settings.justifications.autoWarnings=false;g.siteOff={data:{weekly:{all:[0]},dates:[]},syncedAt:now};
 g.attendance.rosters['2026-11-10']={date:'2026-11-10',shifts:{manha:[user],tarde:[],noite:[],madrugada:[]}};
 const guild={id,members:{cache:new Map()},channels:{}};
 const result=await runtime.runGuild(guild,now);assert.equal(result.processed,1);
 assert.equal(g.attendance.days[`2026-11-10:${user}:manha`].status,'falta');
 assert.equal(Object.keys(g.attendance.warnings).length,0);
});

test('bot bloqueia autorização do site sem ambos os dias locais comprovados',async()=>{
 const id='777777777777777777',u='888888888888888888',g=store.get(id);
 g.settings.justifications.autoWarnings=true;g.settings.justifications.warningChannelId='ch';g.settings.justifications.warningRoles=['w1','w2','w3'];
 g.attendance.enabledAfterDate='2026-11-08';g.siteOff={data:{weekly:{all:[0]},dates:[]},syncedAt:timestamp};
 g.attendance.days[`2026-11-09:${u}:noite`]={date:'2026-11-09',userId:u,shift:'noite',status:'falta',minutes:0};
 g.attendance.days[`2026-11-10:${u}:noite`]={date:'2026-11-10',userId:u,shift:'noite',status:'falta',minutes:0};
 const fake={id,members:{cache:new Map(),fetch:async()=>{throw Error('Não deveria tentar atribuir cargo')}}};
 const item={id:`${u}:noite:2026-11-10`,userId:u,shift:'noite',date:'2026-11-10',evidenceDays:['2026-11-09','2026-11-10']};
 assert.equal((await runtime.applySiteApprovals(fake,g,[item],timestamp)).applied,0); // sem escala histórica
 g.attendance.rosters['2026-11-09']={shifts:{noite:[u]}};g.attendance.rosters['2026-11-10']={shifts:{noite:[u]}};
 g.justifications['J-01']={userId:u,shift:'noite',date:'2026-11-10',status:'pending'};
 assert.equal((await runtime.applySiteApprovals(fake,g,[item],timestamp)).applied,0); // recurso pendente
});
