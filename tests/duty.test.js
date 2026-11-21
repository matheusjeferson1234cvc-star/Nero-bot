'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {defaultGuild,migrateGuild,panelSettings,effectiveRole}=require('../src/config');
const {start,pause,resume,finish,cancel,ongoing,workedMs,ranking,rankTier,formatMs,list,serviceRoleFor}=require('../src/duty');
const T=1_750_000_000_000;
function blank(){return defaultGuild();}
test('nova entrada cria cartão único e impede duas entradas abertas',()=>{
 const g=blank();const c=start(g,'org','a','PNT-1',T);
 assert.equal(c.status,'active');assert.equal(ongoing(g,'org','a').id,'PNT-1');
 assert.throws(()=>start(g,'org','a','PNT-2',T+1000),/aberto/);
});
test('tempo de pausa é excluído do ranking',()=>{
 const g=blank();start(g,'org','a','PNT-1',T);
 pause(g,'PNT-1','lider',T+3600000);
 assert.equal(workedMs(g.dutyCards['PNT-1'],T+7_200_000),3600000);
 resume(g,'PNT-1','lider',T+7_200_000);
 finish(g,'PNT-1',T+10_800_000);
 assert.equal(workedMs(g.dutyCards['PNT-1']),7_200_000);
 assert.equal(g.dutyCards['PNT-1'].pausedMs,3_600_000);
 assert.equal(formatMs(ranking(g,'org')[0].totalMs),'2h 00m');
});
test('cartão cancelado permanece no histórico mas sai do ranking',()=>{
 const g=blank();start(g,'policia','b','PNT-3',T);finish(g,'PNT-3',T+5_400_000);
 assert.equal(ranking(g,'policia')[0].totalMs,5_400_000);
 cancel(g,'PNT-3','chefe',T+5_500_000);
 assert.equal(g.dutyCards['PNT-3'].canceledBy,'chefe');
 assert.deepEqual(ranking(g,'policia'),[]);
 assert.equal(list(g,'policia').length,1);
 assert.throws(()=>cancel(g,'PNT-3','chefe',T+5_600_000),/cancelado/);
});
test('pausa não permite pausa duplicada nem retorno se não houver pausa',()=>{
 const g=blank();start(g,'org','u','PNT-4',T);
 assert.throws(()=>resume(g,'PNT-4','l',T),/pausado/);
 pause(g,'PNT-4','l',T+1000);
 assert.throws(()=>pause(g,'PNT-4','l',T+2000),/serviço/);
});
test('rank automático calcula níveis por horas efetivamente trabalhadas',()=>{
 assert.equal(rankTier(0),0);
 assert.equal(rankTier(120*60000),1);
 assert.equal(rankTier(600*60000),2);
 assert.equal(rankTier(1800*60000),3);
});
test('ranking filtra módulos e soma cartões válidos',()=>{
 const g=blank();start(g,'org','u','PNT-1',T);finish(g,'PNT-1',T+7200000);
 start(g,'org','u','PNT-2',T+7200001);finish(g,'PNT-2',T+10800001);
 start(g,'policia','u','PNT-3',T);finish(g,'PNT-3',T+3000000);
 assert.equal(ranking(g,'org')[0].totalMs,10_800_000);
 assert.equal(ranking(g,'policia')[0].totalMs,3_000_000);
});
test('migração do v1.1 mantém turno ativo e ficha existente',()=>{
 const previous={modules:{org:{roles:{em_servico:'X'}}}, duties:{'org:u1':{module:'org',userId:'u1',startedAt:T,endedAt:null,accumulatedMs:30000}},applications:{'REG-1':{status:'pendente'}}};
 const g=migrateGuild(previous);assert.equal(ongoing(g,'org','u1').status,'active');
 assert.equal(ongoing(g,'org','u1').workMs,30000);
 assert.equal(g.applications['REG-1'].status,'pendente');
 assert.ok(g.modules.org.panelSettings.ranking);
});
test('ranks de equipes são independentes e herdados corretamente',()=>{
 const g=blank();g.modules.org.roles.rank1='T1';
 assert.equal(effectiveRole(g,'org','plantao','rank1'),'T1');
 panelSettings(g,'org','plantao').roles.rank1='ESPECIAL';
 assert.equal(effectiveRole(g,'org','plantao','rank1'),'ESPECIAL');
 assert.equal(effectiveRole(g,'policia','plantao','rank1'),null);
});

// Protege cartões antigos quando a configuração do cargo muda enquanto há serviço ativo.
test('cargo usado no ponto fica vinculado ao cartão, mesmo após configurar outro cargo',()=>{
 const g=blank();const c=start(g,'org','u','PNT-20',T,'CARGO_ANTIGO');
 assert.equal(c.serviceRoleId,'CARGO_ANTIGO');
 assert.equal(serviceRoleFor(c,'CARGO_NOVO'),'CARGO_ANTIGO');
 pause(g,c.id,'lider',T+1000);
 resume(g,c.id,'lider',T+2000);
 c.serviceRoleId='CARGO_NOVO';
 assert.equal(serviceRoleFor(c,'CARGO_ATUAL'),'CARGO_NOVO');
 finish(g,c.id,T+5000);
 assert.equal(c.status,'ended');
});
test('cartão legado sem cargo salvo utiliza cargo configurado ou nenhum',()=>{
 assert.equal(serviceRoleFor({status:'active'},'CARGO_ATUAL'),'CARGO_ATUAL');
 assert.equal(serviceRoleFor({status:'paused'},null),null);
});
