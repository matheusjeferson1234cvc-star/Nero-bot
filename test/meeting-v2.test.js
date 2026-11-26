'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classify,command,notice,record}=require('../src/meeting-v2');
const {normalizeWelcome}=require('../src/bot-config-schema');
test('reunião separa presença real, ausência, justificativa aprovada e pendente',()=>{
 const x={roster:['1','2','3','4','5','6'],rsvp:{'2':'yes'},present:{'1':{},'6':{}},justifications:{'3':{status:'approved'},'4':{status:'pending'},'5':{status:'rejected'},'6':{status:'approved'}}};
 assert.deepEqual(classify(x),{present:['1','6'],absent:['2','5'],justified:['3'],pending:['4']});
 assert.equal(command.toJSON().name,'painelreuniao');
});
test('boas-vindas V2 preserva valores anteriores e valida GIF e cor',()=>{
 const config=normalizeWelcome({join:{enabled:true,channelId:'123456789012345678',message:'Olá',title:'Bem-vindo',color:'#abcdef',avatar:false,banner:true,gif:'https://example.com/a.gif'}});
 assert.equal(config.join.title,'Bem-vindo');assert.equal(config.join.avatar,false);assert.equal(config.leave.enabled,false);
 assert.throws(()=>normalizeWelcome({leave:{gif:'http://example.com/a.gif'}}));
 assert.throws(()=>normalizeWelcome({join:{color:'red'}}));
});

test('aviso público sem botões; administração separada',()=>{
 const x={id:'abc',title:'Reunião geral',description:'Aviso',when:Date.parse('2099-06-15T23:00:00Z'),status:'scheduled',rsvp:{},present:{},justifications:{},roster:null};
 const n=JSON.stringify(notice(x).components[0].toJSON()),a=JSON.stringify(record(x).components[0].toJSON());
 assert.ok(n.includes('Comunicado oficial'));assert.ok(!n.includes('custom_id'));assert.ok(a.includes('m42:start:abc'));
 assert.ok(!JSON.stringify(notice({...x,status:'closed'}).components[0].toJSON()).includes('custom_id'));
 assert.ok(JSON.stringify(record({...x,status:'closed'}).components[0].toJSON()).includes('m42:report:abc'));
});
