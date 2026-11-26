'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {commands,dateValue,absenceApproved}=require('../src/nero-modules');
test('três comandos válidos e cargo obrigatório antes das opções opcionais',()=>{
 const json=commands.map(c=>c.toJSON());
 assert.deepEqual(json.map(c=>c.name),['painelreuniao','painelatendimento','painelcurso']);
 assert.equal(json[1].options[0].name,'atendentes');
 assert.equal(json[1].options[0].required,true);
});
test('horário de Brasília, rejeitando datas inválidas e passadas',()=>{
 assert.equal(dateValue('2099-06-15 20:00'),Date.parse('2099-06-15T23:00:00Z'));
 assert.throws(()=>dateValue('2099-02-30 20:00'));
 assert.throws(()=>dateValue('2000-01-01 00:00'));
 assert.throws(()=>dateValue('amanhã'));
});
test('reutiliza somente justificativa aprovada do membro e da data',()=>{
 const g={settings:{timezone:'America/Sao_Paulo'},justifications:{a:{userId:'1',status:'approved',dates:['2099-06-15']},b:{userId:'2',status:'pending',date:'2099-06-15'}}};
 const when=Date.parse('2099-06-15T23:00:00Z');
 assert.equal(absenceApproved(g,'1',when),true);
 assert.equal(absenceApproved(g,'2',when),false);
 assert.equal(absenceApproved(g,'3',when),false);
 assert.equal(absenceApproved(g,'1',when+86400000),false);
});

test('notas e média mínima',()=>{const {scoreResult}=require('../src/nero-modules');assert.equal(scoreResult(70,70),'aprovado');assert.equal(scoreResult(69,70),'reprovado');assert.throws(()=>scoreResult(101,70));});
