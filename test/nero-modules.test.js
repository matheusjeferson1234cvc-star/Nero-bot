'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {commands,dateValue,absenceApproved,config,supportPanel,ticketPanel,reportPanel,reportEvent,elapsed}=require('../src/nero-modules');
test('atendimento publica diretamente sem opções slash',()=>{
 const json=commands.map(c=>c.toJSON());
 assert.deepEqual(json.map(c=>c.name),['painelatendimento']);
 assert.equal(json[0].options.length,0);
 assert.equal(json[0].default_member_permissions,'8');
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

test('configuração antiga migra cargo, tickets são temporários e não há transcrição',()=>{
 const cfg=config({roleId:'123456789012345678'});
 assert.deepEqual(cfg.roleIds,['123456789012345678']);assert.equal(cfg.deleteDelay,5);assert.equal(cfg.options.length,5);assert.equal(cfg.limit,1);
 const json=supportPanel({iconURL:()=>null},cfg).components[0].toJSON();
 assert.ok(JSON.stringify(json).includes('n41:settings:support'));
 const ticket={id:'abc123',owner:'123456789012345678',assignee:null};
 const open=JSON.stringify(ticketPanel(ticket,cfg).components[0].toJSON());assert.ok(open.includes('n41:claim:abc123'));assert.ok(open.includes('n41:close:abc123'));
 const closed=JSON.stringify(ticketPanel({...ticket,closing:true},cfg).components[0].toJSON());assert.ok(!closed.includes('n41:close:'));
});

test('relatório V2 reúne ações, tempos e não contém conversa nem assunto',()=>{
 const t={id:'abc123',owner:'123456789012345678',createdAt:1000,assignee:null,categoryLabel:'Suporte',subject:'SEGREDO'};
 reportEvent(t,'aberto',t.owner,1000);t.assignee='234567890123456789';reportEvent(t,'claim',t.assignee,61000);reportEvent(t,'release',t.assignee,62000);t.assignee=null;reportEvent(t,'encerrado',t.owner,121000);t.closed=true;t.closedAt=121000;t.closedBy=t.owner;
 assert.equal(t.firstClaimAt,61000);assert.equal(elapsed(t.createdAt,t.firstClaimAt),'1min 0s');
 const payload=reportPanel(t),body=JSON.stringify(payload.components[0].toJSON());
 assert.equal(payload.flags,32768);assert.equal(payload.content,undefined);assert.ok(body.includes('Atendimento assumido'));assert.ok(body.includes('2min 0s'));assert.ok(body.includes('Confirmada'));assert.ok(!body.includes('SEGREDO'));
 for(let i=0;i<30;i++)reportEvent(t,'claim',t.owner,200000+i);
 assert.equal(t.history.length,20);assert.equal(t.firstClaimAt,61000);
});
