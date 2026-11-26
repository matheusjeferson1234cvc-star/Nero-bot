'use strict';
const {parseDateBR}=require('./date-br');
function meetingModal(C,T,H){
 const label=(name,description,component)=>({type:C.Label,label:name,description,component});
 const input=(custom_id,style,max_length,placeholder)=>({type:C.TextInput,custom_id,style,max_length,placeholder,required:true});
 return {custom_id:'m42:create',title:'Criar reunião',components:[
  label('Título','Nome que identifica a reunião.',input('title',T.Short,80,'Ex.: Reunião geral')),
  label('Assunto e descrição','Informe os assuntos e orientações.',input('description',T.Paragraph,500,'Ex.: Avisos e alinhamento da equipe.')),
  label('Data e horário de Brasília','Formato: DD/MM/AAAA HH:MM (24 horas).',input('date',T.Short,16,'Ex.: 28/11/2026 20:00')),
  label('Cargos convocados','Selecione até 25 cargos. Vazio = todos os membros.',{type:C.RoleSelect,custom_id:'roles',placeholder:'Selecione os cargos',min_values:0,max_values:25,required:false}),
  label('Canal de voz','Escolha onde ocorrerá a reunião.',{type:C.ChannelSelect,custom_id:'voice',placeholder:'Selecione o canal de voz',channel_types:[H.GuildVoice],min_values:1,max_values:1,required:true})
 ]};
}
function meetingDate(value,now=Date.now()){
 const m=/^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})$/.exec(String(value).trim());
 const iso=m&&parseDateBR(m[1]);
 if(!iso||Number(m[2])>23||Number(m[3])>59)throw Error('Use DD/MM/AAAA HH:MM (Brasília).');
 const t=Date.parse(`${iso}T${m[2]}:${m[3]}:00-03:00`);
 if(!Number.isFinite(t)||t<=now)throw Error('Informe uma data e horário futuros.');
 return t;
}
function meetingRoles(ids,guildId){const unique=[...new Set(ids)];if(unique.length>25||unique.some(v=>!/^\d{15,25}$/.test(v)))throw Error('Seleção de cargos inválida.');return unique.includes(guildId)?[]:unique;}
function storedRoles(x){return Array.isArray(x.roleIds)?x.roleIds:x.roleId?[x.roleId]:[];}
function roleMatches(x,cache){const roles=storedRoles(x);return !roles.length||roles.some(r=>cache.has(r));}
function roleLabel(x){const roles=storedRoles(x);return roles.length?roles.map(r=>'<@&'+r+'>').join(', '):'Todos os membros';}
module.exports={meetingModal,meetingDate,meetingRoles,roleMatches,roleLabel};
