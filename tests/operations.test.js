'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseBRDate,validateAbsence,getProfile,audit}=require('../src/operations');
const {defaultGuild}=require('../src/config');
const duty=require('../src/duty');
const uid='123456789012345678';

test('data brasileira valida dias e ano, sem normalizar datas inválidas',()=>{
  assert.equal(new Date(parseBRDate('29/02/2028')).toISOString().slice(0,10),'2028-02-29');
  assert.throws(()=>parseBRDate('29/02/2027'),/inválida/);
  assert.throws(()=>parseBRDate('31/11/2026'),/inválida/);
  assert.throws(()=>parseBRDate('2026-11-06'),/formato/);
});
test('ausências exigem intervalo cronológico e têm limite',()=>{
  assert.ok(validateAbsence({'Início':'06/11/2026','Fim':'15/11/2026'}).end>0);
  assert.throws(()=>validateAbsence({'Início':'15/11/2026','Fim':'01/11/2026'}),/anterior/);
  assert.throws(()=>validateAbsence({'Início':'01/01/2027','Fim':'31/12/2027'}),/90 dias/);
});
test('perfil agrega somente dados do usuário e módulo correto',()=>{
  const g=defaultGuild(); duty.start(g,'org',uid,'PNT-1',Date.now()-60000);
  g.applications['A1']={module:'org',userId:uid,status:'pendente'};
  g.warnings['W1']={module:'policia',target:uid};
  const p=getProfile(g,'org',uid,duty);
  assert.equal(p.pending,1);assert.equal(p.warnings,0);assert.ok(p.workedMs>=59000);
});
test('auditoria local limita eventos antigos',()=>{
  const g=defaultGuild();for(let i=0;i<1010;i++)audit(g,'org','teste',uid);
  assert.equal(g.auditEvents.length,1000);
});
