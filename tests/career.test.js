'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {planMovement,saveMovement,recentMovements}=require('../src/career');
const {defaultGuild,migrateGuild}=require('../src/config');
const A='123456789012345678',B='234567890123456789',C='345678901234567890';
test('promoção aceita adição e remoção simultânea de cargos',()=>{
 const m=planMovement({mode:'promocao',targetId:A,addRoles:[B],removeRoles:[C],reason:'Mudança de posto interno RP'});
 assert.deepEqual(m.addRoles,[B]);assert.deepEqual(m.removeRoles,[C]);
});
test('rebaixamento requer motivo e pelo menos uma tag para mudar',()=>{
 assert.throws(()=>planMovement({mode:'rebaixamento',targetId:A,addRoles:[],reason:'Teste válido'}),/Selecione um cargo/);
 assert.throws(()=>planMovement({mode:'rebaixamento',targetId:A,addRoles:[B],reason:'bad'}),/motivo/);
});
test('não permite cargo duplicado nas duas listas nem alvo inválido',()=>{
 assert.throws(()=>planMovement({mode:'promocao',targetId:A,addRoles:[B],removeRoles:[B],reason:'Motivo permitido'}),/mesma movimentação/);
 assert.throws(()=>planMovement({mode:'promocao',targetId:'abc',addRoles:[B],reason:'Motivo permitido'}),/integrante/);
 assert.throws(()=>planMovement({mode:'promocao',targetId:A,addRoles:['abc'],reason:'Motivo permitido'}),/cargo/);
 assert.throws(()=>planMovement({mode:'promocao',targetId:A,addRoles:[A,B,C,A,'456789012345678901','567890123456789012','678901234567890123'],reason:'Motivo permitido'}),/até 5/);
});
test('registro de movimentação mantém módulo e histórico separado',()=>{
 const g=defaultGuild();const n=Date.now();
 saveMovement(g,{id:'PRO-1',module:'org',mode:'promocao',targetId:A,actorId:B,createdAt:n,reason:'Aumento por mérito RP'});
 saveMovement(g,{id:'REB-1',module:'policia',mode:'rebaixamento',targetId:B,actorId:A,createdAt:n+2,reason:'Redução interna RP'});
 assert.deepEqual(recentMovements(g,'org').map(x=>x.id),['PRO-1']);
 assert.deepEqual(recentMovements(g,'policia').map(x=>x.id),['REB-1']);
 assert.throws(()=>saveMovement(g,{id:'PRO-1',module:'org'}),/duplicado/);
});
test('migração de servidor anterior mantém registros antigos',()=>{
 const g=migrateGuild({modules:{org:{roles:{membro:A},channels:{logs:B}}},schedules:{'ESC-old':{status:'prevista'}}});
 assert.equal(g.modules.org.roles.membro,A);assert.equal(g.modules.org.channels.logs,B);
 assert.deepEqual(g.movements,{});assert.deepEqual(g.modules.org.careerAllowedRoleIds,[]);
 assert.ok(g.schedules['ESC-old']); // Não apaga dados antigos da pessoa.
});
