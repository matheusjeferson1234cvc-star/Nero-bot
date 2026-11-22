'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../src/core');
const attendance=require('../src/attendance');
const reports=require('../src/presence-reports');
test('justificativa conta dias de segunda a sábado e pula domingo',()=>{
 assert.deepEqual(attendance.requestedDates('2026-11-21',3),['2026-11-21','2026-11-23','2026-11-24']);
 assert.deepEqual(attendance.requestedDates('2026-11-22',1),['2026-11-23']);
 assert.throws(()=>attendance.requestedDates('2026-11-22',61));
});
test('justificativa aprovada cobre cada data do período',()=>{
 const g=core.defaultGuild();
 g.justifications.A={id:'A',userId:'1',date:'2026-11-21',dates:['2026-11-21','2026-11-23','2026-11-24'],shift:'manha',status:'approved'};
 assert.equal(attendance.sameDayReason(g,'1','2026-11-23','manha')?.id,'A');
 assert.equal(attendance.sameDayReason(g,'1','2026-11-22','manha'),undefined);
});
test('presença é apurada no horário do turno, sem contar horas de outro turno',()=>{
 const g=core.defaultGuild(),s=g.settings,t=attendance.dayStart('2026-11-23','Etc/UTC');
 s.timezone='Etc/UTC';s.shifts.manha.start='08:00';s.shifts.manha.end='10:00';
 g.attendance.rosters['2026-11-23']={date:'2026-11-23',shifts:{manha:['1','2','3','4'],tarde:[],noite:[],madrugada:[]}};
 const card=core.createSoloCard(g,{shift:'manha',leaderId:'1',now:t+8*3600000});
 core.finish(card,'1',t+10*3600000);
 const partial=core.createSoloCard(g,{shift:'manha',leaderId:'2',now:t+8*3600000});
 core.finish(partial,'2',t+8.5*3600000);
 const other=core.createSoloCard(g,{shift:'tarde',leaderId:'3',now:t+8*3600000});
 core.finish(other,'3',t+10*3600000);
 g.siteOff={data:{weekly:{all:[0]},dates:[]},syncedAt:t+10*3600000};
 g.justifications.J={id:'J',userId:'3',date:'2026-11-23',dates:['2026-11-23'],status:'approved',shift:'manha'};
 const report=reports.compileReport(g,'2026-11-23','manha',t+10*3600000);
 assert.equal(report.groups.presentes.length,1);
 assert.equal(report.groups.parciais.length,1);
 assert.equal(report.groups.justificados.length,1);
 assert.equal(report.groups.faltas.length,1);
 assert.match(reports.chunks(report)[0],/Faltas/);
});
test('sem sincronização recente das folgas não inventa faltas',()=>{
 const g=core.defaultGuild();
 g.attendance.rosters['2026-11-23']={shifts:{manha:['1']}};
 const result=reports.compileReport(g,'2026-11-23','manha',Date.now());
 assert.equal(result.groups.faltas.length,0);
 assert.equal(result.groups.naoVerificados.length,1);
});
