const test=require('node:test');const assert=require('node:assert/strict');
const {defaultGuild}=require('../src/config');const tm=require('../src/team');
const mk=()=>defaultGuild();
test('bate-ponto não aceita equipe sem equipe de 2 a 4 pessoas',()=>{
 const g=mk();assert.throws(()=>tm.startInvite(g,{id:'a',module:'org',leaderId:'lider',name:'Equipe alfa',invitees:[]}),/1 a 3/);
 assert.throws(()=>tm.startInvite(g,{id:'b',module:'org',leaderId:'lider',name:'Equipe alfa',invitees:['a','a']}),/1 a 3/);
 assert.throws(()=>tm.startInvite(g,{id:'c',module:'org',leaderId:'lider',name:'Equipe alfa',invitees:['a','b','c','d','e']}),/1 a 3/);
});
test('equipe inicia apenas após todos aceitarem',()=>{
 const g=mk(),t=tm.startInvite(g,{id:'EQ1',module:'policia',leaderId:'lid',name:'Equipe Alfa',invitees:['a','b'],now:100,expiryMs:2000});
 assert.equal(t.status,'pending');assert.equal(tm.accept(g,'EQ1','a',110).allAccepted,false);
 assert.throws(()=>tm.launch(g,'EQ1','cargo',120),/Todos/);
 assert.equal(tm.accept(g,'EQ1','b',120).allAccepted,true);
 tm.launch(g,'EQ1','cargo',140);assert.equal(t.status,'active');assert.equal(t.serviceRoleId,'cargo');
});
test('convidado de fora não entra, e convite expira',()=>{
 const g=mk();tm.startInvite(g,{id:'EQ1',module:'org',leaderId:'lid',name:'Equipe Nova',invitees:['a','b'],now:100,expiryMs:10});
 assert.throws(()=>tm.accept(g,'EQ1','x',103),/não foi convidado/);
 assert.throws(()=>tm.accept(g,'EQ1','a',200),/expirou/);
});
test('pausa não conta como horas trabalhadas; cancelamento remove do ranking',()=>{
 const g=mk();tm.startInvite(g,{id:'EQ1',module:'org',leaderId:'lid',name:'Equipe Nova',invitees:['a','b'],now:100,expiryMs:3000});
 tm.accept(g,'EQ1','a',120);tm.accept(g,'EQ1','b',130);tm.launch(g,'EQ1','cargo',200);
 tm.pause(g,'EQ1','lid',1200200);assert.equal(tm.workedMs(g.teams.EQ1,5000200),1200000);
 tm.resume(g,'EQ1','lid',5000200);tm.finish(g,'EQ1',6200200);assert.equal(tm.workedMs(g.teams.EQ1),2400000);
 assert.equal(tm.ranking(g,'org')[0].ms,2400000);
 tm.cancel(g,'EQ1','lid',6300200);assert.equal(tm.ranking(g,'org').length,0);
});
test('participante não pode ter segundo cartão aberto',()=>{
 const g=mk();tm.startInvite(g,{id:'A',module:'org',leaderId:'lid',name:'Equipe 1',invitees:['a','b']});
 assert.throws(()=>tm.startInvite(g,{id:'B',module:'org',leaderId:'outro',name:'Equipe 2',invitees:['a','c']}),/cartão aberto/);
});
test('equipe mínima de duas pessoas (líder + um convidado) pode iniciar',()=>{
 const g=mk();tm.startInvite(g,{id:'EQ2',module:'policia',leaderId:'l',name:'Viatura Beta',invitees:['b'],now:100});
 assert.equal(tm.accept(g,'EQ2','b',120).allAccepted,true);
 tm.launch(g,'EQ2','cargo',130);assert.equal(g.teams.EQ2.members.length,2);assert.equal(g.teams.EQ2.status,'active');
});
