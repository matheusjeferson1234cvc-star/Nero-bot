'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeWelcome}=require('../src/bot-config-schema');
const {render,command}=require('../src/welcome');
test('entradas e saídas desativadas por padrão',()=>{const x=normalizeWelcome();assert.equal(x.join.enabled,false);assert.equal(x.leave.enabled,false);assert.throws(()=>normalizeWelcome({join:{enabled:true}}));});
test('mensagem personalizada e menções externas neutralizadas',()=>{const m={id:'123456789012345678',user:{username:'@everyone'},guild:{name:'Nero',memberCount:8}};assert.equal(render('{membro} {servidor} {total}',m,'join'),'<@123456789012345678> Nero 8');assert.equal(render('{nome}',m,'leave'),'@\u200beveryone');assert.equal(command.toJSON().name,'boasvindas');});

test('entrada e saída incluem menção, nome e total em texto',async()=>{
 const {messagePayload}=require('../src/welcome');
 const member={id:'123456789012345678',user:{username:'teste',globalName:'João'},guild:{name:'Nero',memberCount:72}};
 const cfg={title:'Até logo!',message:'{nome} saiu de {servidor}',color:'#dc2626',banner:false,avatar:false};
 const out=await messagePayload(member,'leave',cfg);
 assert.ok(out.content.includes('<@'+member.id+'>'));assert.deepEqual(out.allowedMentions.users,[member.id]);assert.ok(out.embeds[0].toJSON().description.includes('João'));assert.ok(out.embeds[0].toJSON().description.includes('72'));assert.equal(render('{membro}',member,'leave'),'<@'+member.id+'>');
 const preview=await messagePayload(member,'join',cfg,true);assert.deepEqual(preview.allowedMentions.users,[]);
});
test('cartão usa caminhos vetoriais e gera PNG sem depender de fontes do servidor',async()=>{
 const {cardSvg,welcomeCard}=require('../src/welcome-card');
 const m={user:{username:'joao',globalName:'João'},guild:{name:'Nero',memberCount:72,iconURL:()=>null}};
 const cfg={title:'Até logo! 👋',color:'#dc2626',avatar:false};
 const svg=cardSvg(m,'leave',cfg);assert.ok(svg.includes('<path '));assert.ok(!svg.includes('<text'));
 const png=await welcomeCard(m,'leave',cfg);assert.equal(png.subarray(1,4).toString(),'PNG');
});
