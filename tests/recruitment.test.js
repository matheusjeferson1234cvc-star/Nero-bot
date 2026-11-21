const test=require('node:test');const assert=require('node:assert/strict');
const r=require('../src/recruitment');
test('perguntas podem ser adicionadas, editadas e removidas',()=>{
 const c=r.defaultRecruitment();const old=c.questions.length;
 r.addQuestion(c,{text:'Qual seu personagem RP?',kind:'short',required:false});assert.equal(c.questions.length,old+1);
 r.changeQuestion(c,old,{text:'Qual é seu setor fictício?',kind:'long',required:true});assert.equal(c.questions[old].kind,'long');
 r.removeQuestion(c,old);assert.equal(c.questions.length,old);
});
test('mensagens permitem personalização sem menções massivas',()=>{
 assert.match(r.renderMessage('Olá {equipe} - @everyone!'),/@\u200beveryone/);
 assert.equal(r.renderMessage('ID {protocolo}',{protocolo:'R1'}),'ID R1');
});
