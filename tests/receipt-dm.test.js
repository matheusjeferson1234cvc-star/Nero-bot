'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core');
const {sendReceiptDM}=require('../src/receipt-dm');
const silent={warn(){}};
function fixture(){const now=Date.now();const g=core.defaultGuild(),card=core.createSoloCard(g,{shift:'noite',leaderId:'123',now:now-60000});core.finish(card,'123',now);return {card,member:card.members[0]};}
const ui={mentions:{parse:[]},pointReceipt:()=>({title:'Comprovante por mensagem'}),receiptActions:()=>[{type:'botao-link'}]};
test('PV recebe só mensagem, embed e link, mesmo com opção legada de imagem ativa',async()=>{
 const {card,member}=fixture(),sent=[],user={id:'123',async send(o){sent.push(o)}};
 const result=await sendReceiptDM({user,card,member,notifications:{pointDm:true,receiptImage:true},logger:silent},{ui});
 assert.equal(result.sent,true);assert.equal(result.mode,'text');assert.equal(sent.length,1);
 assert.equal(sent[0].embeds[0].title,'Comprovante por mensagem');
 assert.equal(sent[0].files,undefined);assert.deepEqual(sent[0].components,[{type:'botao-link'}]);
});
test('ponto com PV desativado não envia mensagem',async()=>{
 const {card,member}=fixture(),sent=[],user={id:'123',async send(o){sent.push(o)}};
 const result=await sendReceiptDM({user,card,member,notifications:{pointDm:false},logger:silent},{ui});
 assert.equal(result.mode,'disabled');assert.equal(sent.length,0);
});
test('PV bloqueado não trava o encerramento do cartão',async()=>{
 const {card,member}=fixture(),user={id:'123',async send(){throw Object.assign(new Error('PV bloqueado'),{code:50007})}};
 const result=await sendReceiptDM({user,card,member,logger:silent},{ui});
 assert.equal(result.sent,false);assert.equal(result.mode,'dm-blocked');assert.equal(card.status,'ended');
});
test('outro erro de envio é reportado sem enviar imagens alternativas',async()=>{
 const {card,member}=fixture(),calls=[],user={id:'123',async send(o){calls.push(o);throw Error('Falha temporária')}};
 const result=await sendReceiptDM({user,card,member,logger:silent},{ui});
 assert.equal(result.sent,false);assert.equal(result.mode,'failed');assert.equal(calls.length,1);assert.equal(calls[0].files,undefined);
});
