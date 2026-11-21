'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {defaultGuild,effectiveRankRoles}=require('../src/config');
test('ranking aplica prioridade ao cargo específico, depois bate-ponto e depois geral',()=>{
  const g=defaultGuild();
  g.modules.org.roles.rank1='geral_1';
  g.modules.org.roles.rank2='geral_2';
  g.modules.org.panelSettings.plantao.roles.rank1='ponto_1';
  g.modules.org.panelSettings.ranking.roles.rank1='ranking_1';
  assert.deepEqual(effectiveRankRoles(g,'org'),['ranking_1','geral_2',null]);
  g.modules.org.panelSettings.ranking.roles.rank1=null;
  assert.deepEqual(effectiveRankRoles(g,'org'),['ponto_1','geral_2',null]);
  assert.deepEqual(effectiveRankRoles(g,'policia'),[null,null,null]);
});
