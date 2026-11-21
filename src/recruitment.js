'use strict';
// Configuração do recrutamento por servidor e por módulo RP.
const MAX_QUESTIONS=20;
const QUESTIONS_PER_PAGE=4; // deixa a quinta posição do modal para RG fictício opcional.
const DEFAULT_QUESTIONS=Object.freeze([
  {text:'Nome fictício do personagem RP',kind:'short',required:true},
  {text:'Qual é sua experiência com roleplay?',kind:'long',required:true},
  {text:'Por que deseja entrar nesta equipe RP?',kind:'long',required:true},
  {text:'Qual é sua disponibilidade para jogar?',kind:'short',required:true},
]);
const MESSAGE_TITLES=Object.freeze({
  welcome:'Boas-vindas',next:'Próxima etapa',submitted:'Ficha recebida',approved:'Aprovado',rejected:'Reprovado'
});
const DEFAULT_MESSAGES=Object.freeze({
  welcome:'👋 Bem-vindo(a) ao recrutamento de {equipe}! Você responderá {total} pergunta(s). Use apenas informações do seu personagem RP.',
  next:'📋 Etapa {pagina}/{paginas} concluída. Clique em Continuar para responder às próximas perguntas.',
  submitted:'✅ Candidatura recebida! Seu protocolo é {protocolo}. A equipe analisará sua ficha.',
  approved:'✅ Sua candidatura {protocolo} para {equipe} foi aprovada!',
  rejected:'❌ Sua candidatura {protocolo} para {equipe} não foi aprovada desta vez.',
});
function defaultRecruitment(){return {questions:DEFAULT_QUESTIONS.map(x=>({...x})), messages:{...DEFAULT_MESSAGES}};}
function normalizeQuestion(input){
  if(!input||typeof input!=='object')throw new Error('Pergunta inválida.');
  const text=String(input.text||'').trim().replace(/\s+/g,' ');
  if(text.length<5||text.length>100)throw new Error('A pergunta deve ter entre 5 e 100 caracteres.');
  const kind=input.kind==='long'?'long':'short';
  return {text,kind,required:input.required!==false};
}
function ensureRecruitment(p){
  if(!p.recruitment||typeof p.recruitment!=='object')p.recruitment=defaultRecruitment();
  if(!Array.isArray(p.recruitment.questions)||!p.recruitment.questions.length)p.recruitment.questions=DEFAULT_QUESTIONS.map(x=>({...x}));
  p.recruitment.questions=p.recruitment.questions.slice(0,MAX_QUESTIONS).map(normalizeQuestion);
  p.recruitment.messages={...DEFAULT_MESSAGES,...(p.recruitment.messages||{})};
  return p.recruitment;
}
function addQuestion(cfg,question){
  if(cfg.questions.length>=MAX_QUESTIONS)throw new Error('Limite de 20 perguntas alcançado.');
  const q=normalizeQuestion(question);
  if(cfg.questions.some(x=>x.text.toLowerCase()===q.text.toLowerCase()))throw new Error('Essa pergunta já existe.');
  cfg.questions.push(q);return cfg;
}
function changeQuestion(cfg,index,question){
  if(!Number.isInteger(index)||index<0||index>=cfg.questions.length)throw new Error('Número de pergunta inválido.');
  const q=normalizeQuestion(question);
  if(cfg.questions.some((x,i)=>i!==index&&x.text.toLowerCase()===q.text.toLowerCase()))throw new Error('Essa pergunta já existe.');
  cfg.questions[index]=q;return cfg;
}
function removeQuestion(cfg,index){
  if(cfg.questions.length===1)throw new Error('É necessário manter pelo menos uma pergunta.');
  if(!Number.isInteger(index)||index<0||index>=cfg.questions.length)throw new Error('Número de pergunta inválido.');
  cfg.questions.splice(index,1);return cfg;
}
// Compatibilidade com placeholders permitidos; não menciona @everyone/@here de ninguém.
function renderMessage(template,vars={}){
  return String(template||'').replace(/\{(equipe|total|protocolo|pagina|paginas)\}/g,(match,key)=>String(vars[key]??match))
    .replace(/@/g,'@\u200b').slice(0,1600);
}
function pageCount(questions){return Math.ceil(questions.length/QUESTIONS_PER_PAGE);}
function pageQuestions(questions,page){
  if(!Number.isInteger(page)||page<0||page>=pageCount(questions))throw new Error('Etapa inválida.');
  return questions.slice(page*QUESTIONS_PER_PAGE,(page+1)*QUESTIONS_PER_PAGE);
}
function collectAnswers(fields,questions,page){
  const answers={};const slice=pageQuestions(questions,page);
  for(let i=0;i<slice.length;i++){
    const value=String(fields.getTextInputValue(`q${page*QUESTIONS_PER_PAGE+i}`)||'').trim();
    if(slice[i].required&&!value)throw new Error(`A pergunta ${page*QUESTIONS_PER_PAGE+i+1} é obrigatória.`);
    answers[`q${page*QUESTIONS_PER_PAGE+i}`]=value;
  }
  return answers;
}
function fieldsFromAnswers(questions,answers){
  return Object.fromEntries(questions.map((q,i)=>[`${i+1}. ${q.text}`,answers[`q${i}`]||'(sem resposta)']));
}
module.exports={MAX_QUESTIONS,QUESTIONS_PER_PAGE,DEFAULT_QUESTIONS,DEFAULT_MESSAGES,MESSAGE_TITLES,defaultRecruitment,normalizeQuestion,ensureRecruitment,addQuestion,changeQuestion,removeQuestion,renderMessage,pageCount,pageQuestions,collectAnswers,fieldsFromAnswers};
