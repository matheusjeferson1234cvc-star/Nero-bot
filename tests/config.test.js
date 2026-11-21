const test=require('node:test');const assert=require('node:assert/strict');
const {defaultGuild,migrateGuild,cfg,PANELS,MODULES,validateBannerUrl}=require('../src/config');
const {commands}=(()=>{const fs=require('node:fs');return {commands:[]}})();
test('oito configurações independentes entre Organização e Polícia',()=>{
 const g=defaultGuild();assert.equal(Object.keys(MODULES).length*Object.keys(PANELS).length,8);
 const a=cfg(g,'org','gestao'),b=cfg(g,'policia','gestao'),c=cfg(g,'org','registro');
 a.channels.logs='canal-A';a.roles.patentes[0]='patente-A';
 assert.notEqual(b.channels.logs,'canal-A');assert.notEqual(c.channels.logs,'canal-A');
 assert.equal(b.roles.patentes[0],null);
});
test('migração da configuração anterior preserva registros',()=>{
 const prior={modules:{org:{roles:{lider:'123'},channels:{logs:'abc'},panels:{registro:{channelId:'1',messageId:'2'}},panelSettings:{registro:{title:'Registro antigo'}}}},registrations:{x:{id:'a'}}};
 const g=migrateGuild(prior);assert.equal(g.registrations.x.id,'a');
 assert.equal(cfg(g,'org','registro').published.messageId,'2');assert.equal(cfg(g,'org','registro').title,'Registro antigo');
 assert.equal(cfg(g,'org','recrutamento').roles.lider,'123');
});
test('GIF de URL externa exige HTTPS e .gif',()=>{
 assert.equal(validateBannerUrl('padrao'),null);assert.equal(validateBannerUrl('https://host.com/ban.gif'),'https://host.com/ban.gif');
 assert.throws(()=>validateBannerUrl('http://site.com/ban.gif'));
 assert.throws(()=>validateBannerUrl('https://site.com/ban.png'));
});
