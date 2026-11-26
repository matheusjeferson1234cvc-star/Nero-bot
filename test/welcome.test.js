'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeWelcome}=require('../src/bot-config-schema');
const {render,command}=require('../src/welcome');
test('entradas e saídas desativadas por padrão',()=>{const x=normalizeWelcome();assert.equal(x.join.enabled,false);assert.equal(x.leave.enabled,false);assert.throws(()=>normalizeWelcome({join:{enabled:true}}));});
test('mensagem personalizada e menções externas neutralizadas',()=>{const m={id:'123456789012345678',user:{username:'@everyone'},guild:{name:'Nero',memberCount:8}};assert.equal(render('{membro} {servidor} {total}',m,'join'),'<@123456789012345678> Nero 8');assert.equal(render('{nome}',m,'leave'),'@\u200beveryone');assert.equal(command.toJSON().name,'boasvindas');});
