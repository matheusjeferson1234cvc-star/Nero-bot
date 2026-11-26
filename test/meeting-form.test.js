'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {meetingModal,meetingDate,meetingRoles,roleMatches,roleLabel}=require('../src/meeting-form');
const a='123456789012345678',b='234567890123456789',g='345678901234567890';
test('modal tem cinco campos, cargos opcionais e canal de voz obrigatório',()=>{
 const m=meetingModal({Label:18,TextInput:4,RoleSelect:6,ChannelSelect:8},{Short:1,Paragraph:2},{GuildVoice:2});
 assert.equal(m.components.length,5);const fields=m.components.map(x=>x.component);assert.equal(fields[3].max_values,25);assert.equal(fields[3].required,false);assert.deepEqual(fields[4].channel_types,[2]);assert.equal(fields[4].required,true);
});
test('data brasileira, UTC correto e datas inválidas',()=>{
 assert.equal(meetingDate('28/11/2026 20:00',0),Date.parse('2026-11-28T23:00:00Z'));
 for(const v of ['31/02/2026 20:00','28/11/2026 24:00','28/11/2026 20:60','2026-11-28 20:00'])assert.throws(()=>meetingDate(v,0));assert.throws(()=>meetingDate('28/11/2026 20:00',Date.parse('2026-11-29')));
});
test('multicargos, todos, deduplicação e reuniões antigas',()=>{
 assert.deepEqual(meetingRoles([a,b,a],g),[a,b]);assert.deepEqual(meetingRoles([g,a],g),[]);assert.throws(()=>meetingRoles(['x'],g));
 assert.equal(roleMatches({roleIds:[a,b]},new Set([b])),true);assert.equal(roleMatches({roleIds:[a,b]},new Set()),false);assert.equal(roleMatches({roleId:a},new Set([a])),true);assert.equal(roleMatches({roleId:null},new Set()),true);assert.equal(roleLabel({roleIds:[a,b]}),`<@&${a}>, <@&${b}>`);
});
