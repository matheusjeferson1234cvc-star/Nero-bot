'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
let sharp;try{sharp=require('sharp')}catch{}
const core=require('../src/core');
const receipt=require('../src/receipt-image');
function fixture(){
 const g=core.defaultGuild();
 const c=core.createSoloCard(g,{shift:'noite',leaderId:'111111111111111111',now:1794103200000});
 core.pause(c,c.leaderId,1794105000000); // 30 min
 core.resume(c,c.leaderId,1794105600000); // pause 10 min
 core.finish(c,c.leaderId,1794107400000); // 30 min
 return {card:c,member:c.members[0]};
}
test('PNG contém horário de início, fim, horas reais, pausas e nome',()=>{
 const {card,member}=fixture();
 const svg=receipt.template(card,member,'Usuário de Teste',{timezone:'America/Sao_Paulo'});
 assert.match(svg,/Usuário de Teste/);
 assert.match(svg,/INÍCIO/);
 assert.match(svg,/ENCERRAMENTO/);
 assert.match(svg,/PONTO ENCERRADO/);
 assert.match(svg,/1h 00min 00s/);
 assert.match(svg,/PAUSAS/);
 assert.match(svg,/07\/11\/2026/);
});
test('quem entrou mais tarde usa o próprio início e não o início da equipe',()=>{
 const {card,member}=fixture();
 card.startedAt=1000;member.joinedAt=2000;
 const times=receipt.recordedTimes(card,member);
 assert.equal(times.start,2000);
 assert.equal(times.end,1794107400000);
});
test('imagem real PNG é gerada sem foto disponível e contém tamanho correto',async()=>{
 const {card,member}=fixture();
 const out=await receipt.generateDetailed(card,member,'Nome de Teste',{avatarUrls:[]});
 assert.equal(out.avatarIncluded,false);
 assert.equal(out.buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(out.buffer.readUInt32BE(16),800); assert.equal(out.buffer.readUInt32BE(20),1010);
});
test('avatar da conta é aplicado na imagem quando imagem estiver acessível', {skip:!sharp&&'sharp não disponível no ambiente de teste'}, async()=>{
 const {card,member}=fixture();
 const png=await sharp({create:{width:10,height:10,channels:4,background:{r:50,g:80,b:110,alpha:1}}}).png().toBuffer();
 const out=await receipt.generateDetailed(card,member,'Usuário Teste',{
  avatarUrls:['https://cdn.discordapp.com/test-avatar.png'],
  fetchAvatar:async()=>({ok:true,headers:{get:()=>String(png.length)},arrayBuffer:async()=>png})
 });
 assert.equal(out.avatarIncluded,true,out.reason);
 assert.equal((await sharp(out.buffer).metadata()).format,'png');
});
