'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MODULES, TYPES, defaultGuild, migrateGuild, effectiveChannel, effectiveRole, panelSettings } = require('../src/config');

test('módulos e treze painéis RP disponíveis', () => {
  assert.deepEqual(Object.keys(MODULES), ['org', 'policia']);
  assert.equal(Object.keys(TYPES).length, 13);
  assert.ok(TYPES.status);
  for(const type of ['central','recrutamento','registro','whitelist','rg','suporte','plantao','status','ranking','punicoes','gestao','ausencias','historico']) assert.ok(TYPES[type]);
});
test('configurações independentes entre Organização e Polícia', () => {
  const g = defaultGuild();
  assert.notEqual(g.modules.org, g.modules.policia);
  assert.equal(g.modules.org.channels.analises, null);
  assert.equal(g.modules.policia.roles.membro, null);
  g.modules.org.roles.membro = '123';
  assert.equal(g.modules.policia.roles.membro, null);
  g.modules.org.panelSettings.registro.roles.acesso = '345';
  assert.equal(g.modules.policia.panelSettings.registro.roles.acesso, null);
});
test('plantões e formulários persistem no modelo', () => {
  const g = defaultGuild();
  assert.deepEqual(g.applications, {});
  assert.deepEqual(g.tickets, {});
  assert.deepEqual(g.duties, {});
  assert.equal(g.modules.org.roles.em_servico, null);
});
test('migração preserva dados e adiciona configurações sem apagar fichas', () => {
  const older = { modules: { org: { roles: { membro: 'm1' }, channels: { logs: 'l1' } } }, duties: { 'org:u1': { startedAt: 10 } }, applications: { 'REG-1': { status: 'pendente' } } };
  const g = migrateGuild(older);
  assert.equal(g.applications['REG-1'].status, 'pendente');
  assert.equal(g.duties['org:u1'].startedAt, 10);
  assert.equal(g.modules.org.roles.membro, 'm1');
  assert.equal(g.modules.policia.panelSettings.status.logging, true);
  assert.equal(g.modules.org.channels.logs, 'l1');
  assert.deepEqual(g.modules.org.careerAllowedRoleIds, []);
  assert.ok(g.movements);
  assert.equal(g.modules.org.channels.promocoes, null);
});
test('configurações específicas têm precedência e padrão continua funcional', () => {
  const g = defaultGuild();
  g.modules.org.roles.membro = 'cargo-membro';
  g.modules.org.roles.em_servico = 'cargo-servico';
  g.modules.org.channels.logs = 'canal-log-default';
  assert.equal(effectiveRole(g, 'org', 'recrutamento', 'aprovado'), 'cargo-membro');
  assert.equal(effectiveRole(g, 'org', 'plantao', 'servico'), 'cargo-servico');
  assert.equal(effectiveChannel(g, 'org', 'registro', 'logs'), 'canal-log-default');
  panelSettings(g, 'org', 'registro').channels.logs = 'canal-registro';
  panelSettings(g, 'org', 'registro').roles.aprovado = 'cargo-registro';
  assert.equal(effectiveChannel(g, 'org', 'registro', 'logs'), 'canal-registro');
  assert.equal(effectiveRole(g, 'org', 'registro', 'aprovado'), 'cargo-registro');
  assert.equal(effectiveChannel(g, 'org', 'recrutamento', 'logs'), 'canal-log-default');
});
