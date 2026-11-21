'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {synchronizePanel} = require('../src/panel-sync');

function fixture(authorId='bot') {
 let editCount=0, sendCount=0, saveCount=0;
 const messages=new Map();
 const ref={channelId:'channel',messageId:'old'};
 if(authorId) messages.set('old',{id:'old',author:{id:authorId},edit:async payload=>{
  editCount++;
  assert.equal(payload.attachments.length,0);
  assert.equal(payload.content,null);
 }});
 const channel={messages:{fetch:async id=>{
  if(!messages.has(id))throw Object.assign(new Error('Unknown Message'),{code:10008});
  return messages.get(id);
 }},send:async payload=>{
  sendCount++;
  const id=`new${sendCount}`;
  messages.set(id,{id,author:{id:'bot'},edit:async()=>{editCount++;}});
  return {id};
 }};
 const call=()=>synchronizePanel({guild:{},ref,payload:()=>({components:[],files:['GIF']}),botUserId:'bot',fetchChannel:async()=>channel,save:()=>{saveCount++;}});
 return {call,ref,stats:()=>({editCount,sendCount,saveCount})};
}

test('painel do mesmo bot é editado no lugar, sem enviar cópias',async()=>{
 const f=fixture('bot');
 assert.equal((await f.call()).state,'updated');
 assert.equal((await f.call()).state,'updated');
 assert.deepEqual(f.stats(),{editCount:2,sendCount:0,saveCount:0});
 assert.equal(f.ref.messageId,'old');
});
test('mensagem apagada é republicada uma só vez, com novo ID salvo',async()=>{
 const f=fixture(null);
 assert.equal((await f.call()).state,'recreated');
 assert.equal(f.ref.messageId,'new1');
 assert.equal((await f.call()).state,'updated');
 assert.deepEqual(f.stats(),{editCount:1,sendCount:1,saveCount:1});
});
test('painel antigo de outro bot não é editado nem apagado; nova mensagem salva',async()=>{
 const f=fixture('outro-bot');
 assert.equal((await f.call()).state,'replaced-foreign');
 assert.equal((await f.call()).state,'updated');
 assert.deepEqual(f.stats(),{editCount:1,sendCount:1,saveCount:1});
});
test('erro de permissão na edição não cria mensagens duplicadas',async()=>{
 const ref={channelId:'c',messageId:'x'};let sent=0;
 await assert.rejects(()=>synchronizePanel({guild:{},ref,payload:()=>({components:[]}),botUserId:'bot',save:()=>{},fetchChannel:async()=>({messages:{fetch:async()=>({id:'x',author:{id:'bot'},edit:async()=>{throw Object.assign(new Error('Missing Permissions'),{code:50013});}})},send:async()=>{sent++;}})}),/Missing Permissions/);
 assert.equal(sent,0);
});
test('sem canal salvo não publica nenhum painel',async()=>{
 let fetched=false;
 const res=await synchronizePanel({guild:{},ref:null,payload:()=>({}),botUserId:'bot',fetchChannel:async()=>{fetched=true;},save:()=>{}});
 assert.equal(res.state,'unregistered');assert.equal(fetched,false);
});
