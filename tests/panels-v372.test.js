'use strict';const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../src/core'),web=require('../src/web-config'),schema=require('../src/bot-config-schema');
const fs=require('node:fs');
test('painéis separados preservam IDs de mensagens e alteram só texto de justificativas',()=>{
 const g=core.defaultGuild();const ref={channelId:'123456789012345678',messageId:'234567890123456789'};
 g.settings.justifications.panel=ref;
 const config=schema.normalize(g.settings);config.justifications.panelVisual={title:'Justifique aqui',description:'Descreva sua ausência sem dados sensíveis',customGif:'https://example.com/just.gif'};
 assert.equal(web.apply(g,config,2).changed,true);
 assert.deepEqual(g.settings.justifications.panel,ref);
 assert.equal(g.settings.justifications.panelVisual.title,'Justifique aqui');
 assert.equal(g.settings.panel.title,'🕒 CENTRAL DE PONTO');
 const uiCode=fs.readFileSync(require.resolve('../src/ui'),'utf8');
 assert.match(uiCode,/function justificationPanel\(ephemeral=false,visual=null\)/);
 assert.match(uiCode,/new MediaGalleryItemBuilder\(\)\.setURL\(gif\|\|/);
 assert.match(uiCode,/\.\.\.\(gif\?\{\}:/);
});
test('painel padrão mantém imagem local e aceita os campos antigos',()=>{
 const g=core.defaultGuild();delete g.settings.justifications.panelVisual;
 const n=schema.normalize(g.settings);
 assert.equal(n.justifications.panelVisual.title,'Justificativa de ausência');
 assert.equal(n.justifications.panelVisual.customGif,null);
});
