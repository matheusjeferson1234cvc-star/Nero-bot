'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('../src/core');
const T=1_000_000;
function g(){const guild=core.defaultGuild();guild.settings.minMembers=2;guild.settings.maxMembers=4;return guild;}
function active(){const guild=g(),card=core.createCard(guild,{shift:'tarde',name:'Equipe Alfa',leaderId:'1',invitees:['2'],now:T});core.respondInvite(card,'2',true,T+1000);core.launch(card,T+1000);return {guild,card};}
const classification=(type='normal',shift='tarde')=>({type,originShift:shift});
test('quatro turnos, cada um tem próprio canal, cargos e supervisores',()=>{
 const guild=g();guild.settings.shifts.noite.roleIds=['12'];guild.settings.shifts.noite.logChannelId='99';assert.equal(guild.settings.shifts.tarde.logChannelId,null);assert.deepEqual(guild.settings.shifts.tarde.roleIds,[]);
});
test('migração de roleId antigo para lista de cargos',()=>{const guild=g();guild.settings.shifts.noite.roleId='123';core.padGuild(guild);assert.deepEqual(guild.settings.shifts.noite.roleIds,['123']);});
test('horário atravessando meia-noite',()=>{assert(core.onShift({start:'18:00',end:'02:00'},Date.UTC(2026,0,1,23,30),'Etc/UTC'));assert(core.onShift({start:'18:00',end:'02:00'},Date.UTC(2026,0,2,1,30),'Etc/UTC'));assert(!core.onShift({start:'18:00',end:'02:00'},Date.UTC(2026,0,2,9,0),'Etc/UTC'));});
test('classifica normal por cargo do turno atual',()=>{const s=g().settings.shifts;s.tarde.roleIds=['t'];s.noite.roleIds=['n'];assert.deepEqual(core.classify(s,'tarde',['t']),classification());});
test('quem não tem cargo de turno não aparece em nenhuma lista',()=>{const s=g().settings.shifts;s.tarde.roleIds=['t'];s.noite.roleIds=['n'];assert.equal(core.classify(s,'tarde',['outro']),null);assert.equal(core.allowedFor(s,'tarde',['outro'],'extra'),null);});
test('cargo atual prevalece quando membro tem dois turnos',()=>{const s=g().settings.shifts;s.tarde.roleIds=['t'];s.noite.roleIds=['n'];assert.deepEqual(core.classify(s,'tarde',['t','n']),classification());assert.equal(core.allowedFor(s,'tarde',['t','n'],'extra'),null);});
test('equipe não pode ser criada sem convidado ou com repetição',()=>{const guild=g();assert.throws(()=>core.createCard(guild,{shift:'tarde',name:'Alfa',leaderId:'1',invitees:[]}));assert.throws(()=>core.createCard(guild,{shift:'tarde',name:'Alfa',leaderId:'1',invitees:['2','2']}));});
test('todos os convidados precisam aceitar',()=>{const guild=g(),card=core.createCard(guild,{shift:'tarde',name:'EQUIPE',leaderId:'1',invitees:['2','3'],now:T});assert.throws(()=>core.launch(card,T+1000));assert.equal(core.respondInvite(card,'2',true,T+10),false);assert.equal(core.respondInvite(card,'3',true,T+20),true);core.launch(card,T+30);assert.equal(card.status,'active');});
test('convite recusado e expirado impedem entrada',()=>{const guild=g(),card=core.createCard(guild,{shift:'tarde',name:'EQUIPE',leaderId:'1',invitees:['2'],now:T});core.respondInvite(card,'2',false,T+20);assert.equal(card.status,'declined');assert.throws(()=>core.launch(card,T+50));const other=core.createCard(guild,{shift:'tarde',name:'OUTRA',leaderId:'1',invitees:['3'],now:T});assert.throws(()=>core.respondInvite(other,'3',true,T+16*60000));});
test('pausa e retorno não acumulam horas pausadas',()=>{const {card}=active();core.pause(card,'1',T+61*60000);core.resume(card,'1',T+121*60000);core.finish(card,'1',T+181*60000);assert.equal(core.durationFor(card.members[0]),121*60000-1000);});
test('somente líder pode encerrar e pausar',()=>{const {card}=active();assert.throws(()=>core.pause(card,'2'));assert.throws(()=>core.finish(card,'2'));});
test('membro normal entra no cartão ativo sem horas retroativas',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification(),T+60*60000);core.respondJoin(guild,card,'3',true,T+61*60000);core.finish(card,'1',T+121*60000);assert.equal(core.durationFor(card.members.find(x=>x.userId==='3')),60*60000);});
test('impede membro duplicado e equipe cheia',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification());assert.throws(()=>core.inviteJoin(guild,card,'3','1',classification()));core.inviteJoin(guild,card,'4','1',classification());assert.throws(()=>core.inviteJoin(guild,card,'5','1',classification()));});
test('convite de entrada vencido libera vaga',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification(),T+60000);core.inviteJoin(guild,card,'4','1',classification(),T+20*60000);assert.equal(card.joinInvites['3'],undefined);});
test('cancelamento individual preserva os demais',()=>{const {guild,card}=active();core.finish(card,'1',T+61*60000);const a=core.cancelHours(card,['2'],{actor:'mod',reason:'Registro irregular',now:T+62*60000});assert.equal(a.length,1);assert.equal(core.durationFor(card.members[1]),0);assert(core.durationFor(card.members[0])>0);assert.equal(core.ranking(guild).length,1);});
test('cancelamento de todos invalida cartão',()=>{const {guild,card}=active();core.cancelHours(card,['1','2'],{actor:'mod',reason:'Registro irregular',now:T+10*60000});assert.equal(card.status,'canceled');assert.equal(core.ranking(guild).length,0);});
test('não duplica cancelamento e exige motivo',()=>{const {card}=active();assert.throws(()=>core.cancelHours(card,['2'],{actor:'mod',reason:'a'}));core.cancelHours(card,['2','2'],{actor:'mod',reason:'Motivo completo',now:T+100000});assert.throws(()=>core.cancelHours(card,['2'],{actor:'mod',reason:'Motivo outro'}));});
test('projeto permanece independente de outros módulos',()=>{assert.deepEqual(Object.keys(g()).sort(),['attendance','audit','cards','justifications','nextJustification','nextNumber','settings','siteOff']);});

test('após migração é possível limpar cargos do turno sem ressuscitar cargo antigo',()=>{const guild=g();guild.settings.shifts.noite.roleId='antigo';core.padGuild(guild);guild.settings.shifts.noite.roleIds=[];core.padGuild(guild);assert.deepEqual(guild.settings.shifts.noite.roleIds,[]);});



test('membro de outro turno não pode participar e não existe modalidade extra',()=>{
 const guild=g(),shifts=guild.settings.shifts;
 shifts.tarde.roleIds=['t'];shifts.noite.roleIds=['n'];
 assert.equal(core.classify(shifts,'tarde',['n']),null);
 assert.equal(core.allowedFor(shifts,'tarde',['n'],'extra'),null);
 assert.equal(core.candidateEligible(guild,{shift:'tarde',type:'extra',userId:'3',roleIds:['n']}),false);
 assert.equal(core.candidateEligible(guild,{shift:'tarde',type:'normal',userId:'3',roleIds:['t']}),true);
 const {guild:current,card}=active();
 assert.throws(()=>core.inviteJoin(current,card,'3','1',classification('extra','noite')));
});
test('histórico antigo permanece acessível sem exibir saldo separado de extra',()=>{
 const {guild,card}=active();
 core.finish(card,'1',T+121*60000);
 card.members[1].type='extra';card.members[1].originShift='noite';
 const saldo=core.hoursForUser(guild,'2');
 assert.equal(saldo.extra,0);
 assert.equal(saldo.normal,120*60000-1000);
 const rank=core.ranking(guild).find(x=>x.userId==='2');
 assert.equal(rank.extra,0);
 assert.equal(rank.total,saldo.normal);
});
