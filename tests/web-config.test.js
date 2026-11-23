'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core');const web=require('../src/web-config');
const schema=require('../src/bot-config-schema');
test('aplica horários, cargos e canal do site sem perder os IDs dos painéis publicados',()=>{
 const g=core.defaultGuild();g.settings.panel.published={channelId:'111111111111111111',messageId:'222222222222222222'};
 g.settings.justifications.panel={channelId:'333333333333333333',messageId:'444444444444444444'};
 const incoming=schema.normalize(g.settings);incoming.pointMode='individual';incoming.shifts.noite.roleIds=['555555555555555555'];incoming.shifts.noite.start='20:00';incoming.panel.title='NOVA CENTRAL';
 const first=web.apply(g,incoming,1);assert.equal(first.changed,true);assert.equal(first.applied,true);
 assert.equal(g.settings.pointMode,'individual');assert.deepEqual(g.settings.shifts.noite.roleIds,['555555555555555555']);assert.equal(g.settings.shifts.noite.start,'20:00');
 assert.equal(g.settings.panel.title,'NOVA CENTRAL');assert.equal(g.settings.panel.published.messageId,'222222222222222222');
 assert.equal(g.settings.justifications.panel.messageId,'444444444444444444');assert.equal(g.siteConfigRevision,1);
 const second=web.apply(g,incoming,1);assert.equal(second.changed,false);assert.equal(second.applied,false);
});
test('não aplica payload inválido que poderia corromper os cargos',()=>{
 const g=core.defaultGuild(),before=JSON.stringify(g.settings);
 assert.throws(()=>web.apply(g,{pointMode:'unknown'},1));assert.equal(JSON.stringify(g.settings),before);
});

test('site antigo sem meta não apaga meta obrigatória alterada pelo Discord',()=>{
 const x=core.defaultGuild();
 x.settings.mandatoryMinutes=180;
 const old=schema.normalize(x.settings);
 delete old.mandatoryMinutes;
 const res=web.apply(x,old,1);
 assert.equal(x.settings.mandatoryMinutes,180);
 assert.equal(res.changed,false);
});
