'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const core=require('../src/core'),a=require('../src/attendance');
const g=()=>core.defaultGuild();
test('dia, fuso e folgas semanais/extraordinárias',()=>{
 assert.equal(a.localDay(Date.parse('2026-11-08T02:00:00Z'),'America/Sao_Paulo'),'2026-11-07');
 assert.equal(a.weekday('2026-11-08'),0);
 assert.equal(a.timeOff({weekly:{all:[0]},dates:[]},'2026-11-08','manha'),true);
 assert.equal(a.timeOff({weekly:{all:[0]},dates:[{date:'2026-11-09',shift:'noite'}]},'2026-11-09','noite'),true);
 assert.equal(a.timeOff({weekly:{all:[0]},dates:[]},'2026-11-09','noite'),false);
});
test('ponto normal de 2h conta; extra e cancelado não contam',()=>{
 const x=g(),t=Date.parse('2026-11-10T15:00:00Z');
 let c=core.createSoloCard(x,{shift:'tarde',leaderId:'1',now:t});core.finish(c,'1',t+120*60000);
 assert.equal(a.workedMinutes(x,'1','2026-11-10','America/Sao_Paulo'),120);
 assert.equal(a.evaluation(x,{date:'2026-11-10',shift:'tarde',userId:'1',tz:'America/Sao_Paulo',off:{weekly:{all:[0]},dates:[]}}).status,'cumpriu');
 c.members[0].type='extra';assert.equal(a.workedMinutes(x,'1','2026-11-10','America/Sao_Paulo'),0);
 c.members[0].type='normal';core.cancelHours(c,['1'],{actor:'admin',reason:'Registro inválido',now:t+130*60000});
 assert.equal(a.workedMinutes(x,'1','2026-11-10','America/Sao_Paulo'),0);
});
test('pausa não acumula, individual mantém apenas seu tempo',()=>{
 const x=g(),t=Date.parse('2026-11-09T14:00:00Z'),c=core.createSoloCard(x,{shift:'manha',leaderId:'1',now:t});
 core.pause(c,'1',t+35*60000);core.resume(c,'1',t+80*60000);core.finish(c,'1',t+125*60000);
 assert.equal(a.workedMinutes(x,'1','2026-11-09','America/Sao_Paulo'),80);
 assert.equal(a.evaluation(x,{date:'2026-11-09',shift:'manha',userId:'1',tz:'America/Sao_Paulo',off:{weekly:{all:[0]},dates:[]}}).status,'incompleta');
});
test('dois dias seguidos sem horas dão aviso, ponto parcial ou justificativa zera sequência',()=>{
 assert.deepEqual(a.streakStep(0,'falta'),{streak:1,blocked:false});
 assert.deepEqual(a.streakStep(1,'falta'),{streak:2,blocked:false});
 assert.deepEqual(a.streakStep(1,'incompleta'),{streak:0,blocked:false});
 assert.deepEqual(a.streakStep(1,'justificada'),{streak:0,blocked:false});
 assert.deepEqual(a.streakStep(1,'pendente'),{streak:1,blocked:true});
 assert.deepEqual(a.streakStep(1,'folga'),{streak:0,blocked:false});
});
test('lista não inventa faltas sem escala nem processa o dia corrente',()=>{
 const x=g(),now=Date.parse('2026-11-10T15:00:00Z');x.attendance.enabledAfterDate='2026-11-08';
 assert.deepEqual(a.plan(x,now),[]);
 x.attendance.rosters['2026-11-09']={date:'2026-11-09',shifts:{manha:['12345'],tarde:[],noite:[],madrugada:[]}};
 const records=a.plan(x,now);assert.equal(records.length,1);assert.equal(records[0].status,'falta');
 x.justifications['J1']={id:'J1',userId:'12345',date:'2026-11-09',shift:'manha',status:'pending'};
 assert.equal(a.plan(x,now)[0].status,'pendente');
});


test('folga quebra a sequência de faltas, evitando advertência por dias não consecutivos',()=>{
 const calc=require('../src/attendance');
 assert.equal(calc.streakStep(1,'folga').streak,0);
 assert.equal(calc.streakStep(1,'justificada').streak,0);
 assert.equal(calc.streakStep(1,'cumpriu').streak,0);
 assert.equal(calc.streakStep(1,'falta').streak,2);
});
