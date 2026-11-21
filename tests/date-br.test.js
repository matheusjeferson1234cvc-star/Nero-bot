'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseDateBR,formatDateBR}=require('../src/date-br');
test('formato de justificativa DD/MM/AAAA convertido para ISO interno',()=>{
 assert.equal(parseDateBR('07/11/2026'),'2026-11-07');
 assert.equal(formatDateBR('2026-11-07'),'07/11/2026');
});
test('datas impossíveis e formatos antigos são rejeitados',()=>{
 for(const bad of ['2026-11-07','7/11/2026','31/02/2026','29/02/2025','00/12/2026','33/12/2026','01/13/2026'])assert.equal(parseDateBR(bad),null,bad);
 assert.equal(parseDateBR('29/02/2028'),'2028-02-29');
});
