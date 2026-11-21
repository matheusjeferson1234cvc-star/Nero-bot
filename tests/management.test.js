const test=require('node:test');const assert=require('node:assert/strict');
const {defaultGuild,cfg}=require('../src/config');const mg=require('../src/management');
const p=()=>cfg(defaultGuild(),'org','gestao');
test('promoção avança patentes configuradas em ordem, sem código fixo',()=>{
 const x=p();x.roles.patentes[0]='cabo';x.roles.patentes[4]='sargento';x.roles.patentes[11]='tenente';
 assert.deepEqual(mg.movePlan(x,[],'promocao').add,['cabo']);
 assert.deepEqual(mg.movePlan(x,['cabo'],'promocao'),{add:['sargento'],remove:['cabo'],from:0,to:4});
 assert.deepEqual(mg.movePlan(x,['tenente'],'rebaixamento'),{add:['sargento'],remove:['tenente'],from:11,to:4});
 assert.throws(()=>mg.movePlan(x,['tenente'],'promocao'),/máxima/);
});
test('terceira advertência dispara exoneração e troca cargo',()=>{
 const x=p();x.roles.advertencias=['a1','a2','a3'];x.roles.patentes[0]='cabo';x.roles.patentes[4]='sargento';x.roles.integrante='equipe';x.roles.exonerado='expulso';
 assert.deepEqual(mg.warningPlan(x,undefined),{level:1,add:['a1'],remove:['a2','a3'],exonerate:false});
 assert.equal(mg.warningPlan(x,{count:1}).level,2);
 const last=mg.warningPlan(x,{count:2});assert.equal(last.exonerate,true);assert.ok(last.add.includes('a3'));
 assert.ok(last.add.includes('expulso'));assert.ok(last.remove.includes('cabo'));assert.ok(last.remove.includes('sargento'));assert.ok(last.remove.includes('equipe'));
 assert.throws(()=>mg.warningPlan(x,{count:3}),/exonerado/);
});
