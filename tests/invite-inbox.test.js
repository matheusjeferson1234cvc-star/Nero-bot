'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../src/core');
const inbox=require('../src/invite-inbox');
const NOW=1_800_000_000_000;
function setup(){const g=core.defaultGuild();g.settings.minMembers=2;g.settings.maxMembers=4;return g;}
function initial(g){return core.createCard(g,{shift:'noite',name:'Equipe Orion',leaderId:'owner',invitees:['chosen'],now:NOW});}
test('só o membro convidado vê seu convite pendente, não o líder nem terceiros',()=>{
 const g=setup(),c=initial(g);
 const mine=inbox.pending(g,'chosen',NOW+1000);
 assert.equal(mine.length,1);assert.equal(mine[0].card.id,c.id);assert.equal(mine[0].kind,'initial');
 assert.equal(inbox.pending(g,'owner',NOW+1000).length,0);
 assert.equal(inbox.pending(g,'stranger',NOW+1000).length,0);
});
test('convites vencidos não são exibidos e aceites preservam regra de todos confirmarem',()=>{
 const g=setup(),c=initial(g);
 assert.equal(inbox.pending(g,'chosen',c.expiresAt+1).length,0);
 assert.equal(inbox.pending(g,'chosen',NOW+1).length,1);
 const all=core.respondInvite(c,'chosen',true,NOW+2000);
 assert.equal(all,true);assert.equal(inbox.pending(g,'chosen',NOW+2001).length,0);
 core.launch(c,NOW+3000);assert.equal(c.status,'active');
});
test('convite para entrar em equipe ativa aceita apenas membros do mesmo turno',()=>{
 const g=setup(),c=initial(g);core.respondInvite(c,'chosen',true,NOW+1000);core.launch(c,NOW+2000);
 assert.throws(()=>core.inviteJoin(g,c,'visitante','owner',{type:'extra',originShift:'tarde'},NOW+3000));
 core.inviteJoin(g,c,'normal','owner',{type:'normal',originShift:'noite'},NOW+3000);
 const own=inbox.pending(g,'normal',NOW+3100);
 assert.equal(own.length,1);assert.equal(own[0].kind,'join');assert.equal(own[0].type,'normal');
 assert.equal(inbox.pending(g,'chosen',NOW+3100).length,0);
 assert.equal(inbox.pending(g,'normal',own[0].expiresAt+1).length,0);
 core.respondJoin(g,c,'normal',true,NOW+3200);
 assert.equal(inbox.pending(g,'normal',NOW+3300).length,0);
 assert.equal(c.members.find(x=>x.userId==='normal').type,'normal');
});
test('recusados desaparecem da lista sem iniciar cartão',()=>{
 const g=setup(),c=initial(g);core.respondInvite(c,'chosen',false,NOW+1000);
 assert.equal(inbox.pending(g,'chosen',NOW+2000).length,0);assert.equal(c.status,'declined');
});

const fs=require('node:fs'),path=require('node:path');
test('painel expõe Meus convites e botão processa resposta também no servidor',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/bot.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../src/ui.js'),'utf8');
 assert.match(ui,/bp:invites/);
 assert.match(source,/if\(verb==='invites'\)return showInvites\(i\)/);
 assert.match(source,/if\(i\.isButton\(\)\&\&\/\^\(dm\|dj\):\/\.test\(i\.customId\)\)return handleDM\(i\)/);
 assert.match(source,/if\(i\.inGuild\(\)\)/);
 assert.doesNotMatch(source,/Convite não enviado.*Peça para habilitar mensagens privadas/);
});
