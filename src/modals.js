'use strict';
const {ModalBuilder,LabelBuilder,TextInputBuilder,TextInputStyle,FileUploadBuilder}=require('discord.js');
const rec=require('./recruitment');
function field(id,label,paragraph=false,max=300,value='',required=true){
 const input=new TextInputBuilder().setCustomId(id).setStyle(paragraph?TextInputStyle.Paragraph:TextInputStyle.Short).setMaxLength(max).setRequired(required);
 if(value)input.setValue(String(value).slice(0,max));
 return new LabelBuilder().setLabel(label.slice(0,45)).setTextInputComponent(input);
}
function upload(){return new LabelBuilder().setLabel('RG FICTÍCIO do personagem (opcional)').setDescription('NUNCA envie documentos reais.').setFileUploadComponent(new FileUploadBuilder().setCustomId('rg_rp').setMinValues(0).setMaxValues(1).setRequired(false));}
function modal(id,title,fields){return new ModalBuilder().setCustomId(id).setTitle(title.slice(0,45)).addLabelComponents(...fields);}
function register(m,turn){return modal(`regSubmit:${m}:${turn}`,'🪪 Registro RP',[field('nome','Nome fictício do personagem',false,75),field('idrp','Identificador fictício RP',false,45),field('area','Setor do personagem',false,80),upload()]);}
function recPage(m,page,questions){const count=rec.pageCount(questions),fields=rec.pageQuestions(questions,page).map((q,j)=>field(`q${page*rec.QUESTIONS_PER_PAGE+j}`,q.text,q.kind==='long',q.kind==='long'?900:250,'',q.required));if(page===count-1)fields.push(upload());return modal(`recSubmit:${m}:${page}`,`Candidatura • ${page+1}/${count}`,fields);}
function recQuestion(m,mode,index,prev={}){return modal(`rqSubmit:${m}:${mode}:${index}`,'❓ Pergunta do recrutamento',[field('texto','Pergunta (5–100 caracteres)',false,100,prev.text||''),field('tipo','Tipo: curta ou longa',false,5,prev.kind==='long'?'longa':'curta'),field('obrigatoria','Obrigatória: sim ou nao',false,3,prev.required===false?'nao':'sim')]);}
function recMessage(m,key,prev){return modal(`rmSubmit:${m}:${key}`,'💬 Mensagem do recrutamento',[field('texto','Texto da mensagem enviada pelo bot',true,1000,prev)]);}
function visual(m,p,key,current){return modal(`visualSubmit:${m}:${p}:${key}`,'🎞️ Aparência do painel',[field('texto',key==='title'?'Título':key==='description'?'Descrição':'URL HTTPS do GIF (ou padrao)',key==='description',key==='title'?90:key==='description'?650:400,current||'')]);}
function teamName(m){return modal(`tmName:${m}`,'👥 Nova equipe de serviço',[field('nome','Nome da equipe (3–45 caracteres)',false,45)]);}
function dutyLimits(m,c){return modal(`tmLimits:${m}`,'⏳ Limites do bate-ponto',[
 field('rank1','Ranking nível 1 (minutos)',false,6,String(c.rankMinutes[0])),
 field('rank2','Ranking nível 2 (minutos)',false,6,String(c.rankMinutes[1])),
 field('rank3','Ranking nível 3 (minutos)',false,6,String(c.rankMinutes[2])),
 field('expira','Validade de convite (minutos)',false,3,String(c.inviteMinutes))]);}
function mgReason(m,mode,target){return modal(`mgReason:${m}:${mode}:${target}`,mode==='warn'?'📌 Advertência':'🏅 Movimentação de patente',[field('motivo','Motivo RP (5–400 caracteres)',true,400)]);}
module.exports={field,modal,register,recPage,recQuestion,recMessage,visual,teamName,mgReason,dutyLimits};
