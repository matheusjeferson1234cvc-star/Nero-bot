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
test('classifica outro turno como extra',()=>{const s=g().settings.shifts;s.tarde.roleIds=['t'];s.noite.roleIds=['n'];assert.deepEqual(core.classify(s,'tarde',['n']),classification('extra','noite'));});
test('quem não tem cargo de turno não aparece em nenhuma lista',()=>{const s=g().settings.shifts;s.tarde.roleIds=['t'];s.noite.roleIds=['n'];assert.equal(core.classify(s,'tarde',['outro']),null);assert.equal(core.allowedFor(s,'tarde',['outro'],'extra'),null);});
test('cargo atual prevalece quando membro tem dois turnos',()=>{const s=g().settings.shifts;s.tarde.roleIds=['t'];s.noite.roleIds=['n'];assert.deepEqual(core.classify(s,'tarde',['t','n']),classification());assert.equal(core.allowedFor(s,'tarde',['t','n'],'extra'),null);});
test('equipe não pode ser criada sem convidado ou com repetição',()=>{const guild=g();assert.throws(()=>core.createCard(guild,{shift:'tarde',name:'Alfa',leaderId:'1',invitees:[]}));assert.throws(()=>core.createCard(guild,{shift:'tarde',name:'Alfa',leaderId:'1',invitees:['2','2']}));});
test('todos os convidados precisam aceitar',()=>{const guild=g(),card=core.createCard(guild,{shift:'tarde',name:'EQUIPE',leaderId:'1',invitees:['2','3'],now:T});assert.throws(()=>core.launch(card,T+1000));assert.equal(core.respondInvite(card,'2',true,T+10),false);assert.equal(core.respondInvite(card,'3',true,T+20),true);core.launch(card,T+30);assert.equal(card.status,'active');});
test('convite recusado e expirado impedem entrada',()=>{const guild=g(),card=core.createCard(guild,{shift:'tarde',name:'EQUIPE',leaderId:'1',invitees:['2'],now:T});core.respondInvite(card,'2',false,T+20);assert.equal(card.status,'declined');assert.throws(()=>core.launch(card,T+50));const other=core.createCard(guild,{shift:'tarde',name:'OUTRA',leaderId:'1',invitees:['3'],now:T});assert.throws(()=>core.respondInvite(other,'3',true,T+16*60000));});
test('pausa e retorno não acumulam horas pausadas',()=>{const {card}=active();core.pause(card,'1',T+61*60000);core.resume(card,'1',T+121*60000);core.finish(card,'1',T+181*60000);assert.equal(core.durationFor(card.members[0]),121*60000-1000);});
test('somente líder pode encerrar e pausar',()=>{const {card}=active();assert.throws(()=>core.pause(card,'2'));assert.throws(()=>core.finish(card,'2'));});
test('membro normal entra no cartão ativo sem horas retroativas',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification(),T+60*60000);core.respondJoin(guild,card,'3',true,T+61*60000);core.finish(card,'1',T+121*60000);assert.equal(core.durationFor(card.members.find(x=>x.userId==='3')),60*60000);});
test('hora extra recebe classificação e turno original',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification('extra','noite'),T+60*60000);core.respondJoin(guild,card,'3',true,T+61*60000);const user=card.members.find(x=>x.userId==='3');assert.equal(user.type,'extra');assert.equal(user.originShift,'noite');assert.equal(core.totalFor(card,T+91*60000).extra,30*60000);});
test('horas extras são separadas das horas normais no ranking',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification('extra','manha'),T+60*60000);core.respondJoin(guild,card,'3',true,T+61*60000);core.finish(card,'1',T+121*60000);const ranking=core.ranking(guild),extra=ranking.find(x=>x.userId==='3');assert.equal(extra.normal,0);assert.equal(extra.extra,60*60000);});
test('convite de membro extra não entra se cartão estiver pausado',()=>{const {guild,card}=active();core.pause(card,'1',T+9000);assert.throws(()=>core.inviteJoin(guild,card,'3','1',classification('extra','manha')));});
test('impede membro duplicado e equipe cheia',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification());assert.throws(()=>core.inviteJoin(guild,card,'3','1',classification()));core.inviteJoin(guild,card,'4','1',classification());assert.throws(()=>core.inviteJoin(guild,card,'5','1',classification()));});
test('convite de entrada vencido libera vaga',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification(),T+60000);core.inviteJoin(guild,card,'4','1',classification(),T+20*60000);assert.equal(card.joinInvites['3'],undefined);});
test('cancelamento individual preserva os demais',()=>{const {guild,card}=active();core.finish(card,'1',T+61*60000);const a=core.cancelHours(card,['2'],{actor:'mod',reason:'Registro irregular',now:T+62*60000});assert.equal(a.length,1);assert.equal(core.durationFor(card.members[1]),0);assert(core.durationFor(card.members[0])>0);assert.equal(core.ranking(guild).length,1);});
test('cancelamento extra remove apenas horas extras',()=>{const {guild,card}=active();core.inviteJoin(guild,card,'3','1',classification('extra','manha'),T+60*60000);core.respondJoin(guild,card,'3',true,T+61*60000);core.finish(card,'1',T+121*60000);core.cancelHours(card,['3'],{actor:'mod',reason:'Horas indevidas',now:T+122*60000});assert.equal(core.ranking(guild).find(x=>x.userId==='3'),undefined);assert(core.ranking(guild).find(x=>x.userId==='1').total>0);});
test('cancelamento de todos invalida cartão',()=>{const {guild,card}=active();core.cancelHours(card,['1','2'],{actor:'mod',reason:'Registro irregular',now:T+10*60000});assert.equal(card.status,'canceled');assert.equal(core.ranking(guild).length,0);});
test('não duplica cancelamento e exige motivo',()=>{const {card}=active();assert.throws(()=>core.cancelHours(card,['2'],{actor:'mod',reason:'a'}));core.cancelHours(card,['2','2'],{actor:'mod',reason:'Motivo completo',now:T+100000});assert.throws(()=>core.cancelHours(card,['2'],{actor:'mod',reason:'Motivo outro'}));});
test('projeto permanece independente de outros módulos',()=>{assert.deepEqual(Object.keys(g()).sort(),['attendance','audit','cards','justifications','nextJustification','nextNumber','settings','siteOff']);});

test('após migração é possível limpar cargos do turno sem ressuscitar cargo antigo',()=>{const guild=g();guild.settings.shifts.noite.roleId='antigo';core.padGuild(guild);guild.settings.shifts.noite.roleIds=[];core.padGuild(guild);assert.deepEqual(guild.settings.shifts.noite.roleIds,[]);});


test('hora extra no cartão da tarde não altera o saldo normal do líder e sobrevive ao JSON',()=>{
 const {guild,card}=active();
 core.inviteJoin(guild,card,'3','1',classification('extra','noite'),T+30*60000);
 core.respondJoin(guild,card,'3',true,T+31*60000);
 core.finish(card,'1',T+91*60000);
 const restored=JSON.parse(JSON.stringify(guild));
 const leader=core.hoursForUser(restored,'1'),extra=core.hoursForUser(restored,'3');
 assert.equal(leader.extra,0);
 assert.equal(leader.normal,91*60000-1000);
 assert.equal(extra.normal,0);
 assert.equal(extra.extra,60*60000);
 assert.equal(restored.cards[card.id].members.find(m=>m.userId==='3').originShift,'noite');
});

test('listas separadas por cargos: extra só de turno diferente e nunca sem cargo',()=>{
 const guild=g(),shifts=guild.settings.shifts;
 shifts.tarde.roleIds=['t'];shifts.noite.roleIds=['n'];shifts.manha.roleIds=['m'];
 const allowed=(userId,roleIds,type)=>core.candidateEligible(guild,{shift:'tarde',type,userId,roleIds});
 assert.equal(allowed('noite',['n'],'extra'),true);
 assert.equal(allowed('manha',['m'],'extra'),true);
 assert.equal(allowed('tarde',['t'],'extra'),false);
 assert.equal(allowed('semturno',['outro'],'extra'),false);
 assert.equal(allowed('tarde',['t'],'normal'),true);
 assert.equal(allowed('noite',['n'],'normal'),false);
 assert.equal(allowed('dois',['n','t'],'extra'),false);
});

test('quem já recebeu um convite de extra não aparece em outra lista até expirar',()=>{
 const {guild,card}=active();
 const shift=guild.settings.shifts;shift.noite.roleIds=['n'];
 core.inviteJoin(guild,card,'3','1',classification('extra','noite'),T+3*60000);
 assert(core.pendingInvitation(guild,'3',T+4*60000));
 assert.equal(core.candidateEligible(guild,{shift:'tarde',type:'extra',userId:'3',roleIds:['n']},T+4*60000),false);
 assert.equal(core.candidateEligible(guild,{shift:'tarde',type:'extra',userId:'3',roleIds:['n']},T+20*60000),true);
});

test('cancela apenas hora extra de integrante específico sem apagar o líder',()=>{
 const {guild,card}=active();
 core.inviteJoin(guild,card,'3','1',classification('extra','noite'),T+30*60000);
 core.respondJoin(guild,card,'3',true,T+31*60000);
 core.finish(card,'1',T+91*60000);
 const old=core.hoursForUser(guild,'1').normal;
 core.cancelHours(card,['3'],{actor:'fiscal',reason:'Registro de hora extra sem atividade RP',now:T+92*60000});
 assert.equal(core.hoursForUser(guild,'3').extra,0);
 assert.equal(core.hoursForUser(guild,'1').normal,old);
 assert.equal(core.hoursForUser(guild,'1').extra,0);
});
