'use strict';
const MODULES=Object.freeze({org:{label:'Organização RP',emoji:'👑',color:0x982f7c},policia:{label:'Polícia RP',emoji:'🚔',color:0x1674c7}});
const PANELS=Object.freeze({registro:{label:'Registro',emoji:'🪪'},recrutamento:{label:'Recrutamento',emoji:'📋'},gestao:{label:'Gestão',emoji:'👑'},bateponto:{label:'Bate-ponto',emoji:'⏱️'}});
const TURNS=Object.freeze({manha:'🌅 Manhã',tarde:'🌇 Tarde',noite:'🌙 Noite',madrugada:'🌌 Madrugada'});
const {defaultRecruitment,ensureRecruitment}=require('./recruitment');
function defaultPanel(module,kind){
 const descriptions={registro:'🪪 Cadastre seu personagem fictício e escolha seu turno. Os cargos serão aplicados conforme a configuração.',recrutamento:'📋 Responda às perguntas do processo seletivo. A equipe analisa as respostas em canal privado.',gestao:'👑 Administre patentes, promoções, rebaixamentos e advertências com histórico de movimentações.',bateponto:'⏱️ Crie uma equipe de 2 a 4 pessoas. O cartão começa somente após o aceite de todos.'};
 const config={title:`${PANELS[kind].emoji} ${PANELS[kind].label} • ${MODULES[module].label}`,description:descriptions[kind],bannerUrl:null,channels:{logs:null},roles:{lider:null,acesso:null},published:null};
 if(kind==='recrutamento'){config.channels.analises=null;config.roles.aprovado=null;config.roles.avaliador=null;config.recruitment=defaultRecruitment();}
 if(kind==='registro'){config.roles.turnos={manha:null,tarde:null,noite:null,madrugada:null};config.roles.registrado=null;}
 if(kind==='bateponto'){config.roles.servico=null;config.roles.rank=[null,null,null];config.rankMinutes=[120,600,1800];config.inviteMinutes=15;config.minInvites=2;config.maxInvites=4;}
 if(kind==='gestao'){config.roles.patentes=Array.from({length:20},()=>null);config.roles.advertencias=[null,null,null];config.roles.exonerado=null;config.roles.exonerarExtra=[];config.roles.integrante=null;Object.assign(config.channels,{promocoes:null,rebaixamentos:null,advertencias:null});}
 return config;
}
function defaultGuild(){return {modules:Object.fromEntries(Object.keys(MODULES).map(m=>[m,{panels:Object.fromEntries(Object.keys(PANELS).map(p=>[p,defaultPanel(m,p)]))}])),applications:{},registrations:{},teams:{},warnings:{},movements:{},nextSerial:1,schemaVersion:5};}
function migrateGuild(g){
 if(g.schemaVersion===5)return g;
 g.modules??={};
 for(const m of Object.keys(MODULES)){
  const prev=g.modules[m]??={};prev.panels??={};
  const legacy=prev.panelSettings||{};
  for(const p of Object.keys(PANELS)){
   const d=defaultPanel(m,p),old=prev.panels[p]&&typeof prev.panels[p].title==='string'?prev.panels[p]:legacy[p==='bateponto'?'plantao':p]||{};
   // Dados de versões antigas podem ter 'panels' como ponteiros de mensagem, não configurações.
   const raw=prev.panels[p]?.settings || (old===prev.panels[p] && old.title?old:legacy[p==='bateponto'?'plantao':p]) || {};
   const n={...d,...raw,channels:{...d.channels,...raw.channels},roles:{...d.roles,...raw.roles}};
   if(p==='recrutamento')ensureRecruitment(n);
   if(p==='registro')n.roles.turnos={...d.roles.turnos,...(raw.roles?.turnos||{})};
   if(p==='gestao'){
    n.roles.patentes=Array.from({length:20},(_,i)=>raw.roles?.patentes?.[i]||null);
    n.roles.advertencias=Array.from({length:3},(_,i)=>raw.roles?.advertencias?.[i]||null);
    n.roles.exonerarExtra=Array.isArray(raw.roles?.exonerarExtra)?raw.roles.exonerarExtra.slice(0,20):[];
   }
   if(p==='bateponto'){
    n.roles.rank=Array.from({length:3},(_,i)=>raw.roles?.rank?.[i]||null);
    n.rankMinutes=Array.isArray(raw.rankMinutes)&&raw.rankMinutes.length===3?raw.rankMinutes:d.rankMinutes;
   }
   // preserve existing posted panel pointers from the previous project
   if(!n.published && prev.panels[p]?.messageId)n.published={channelId:prev.panels[p].channelId,messageId:prev.panels[p].messageId};
   // old shared roles & channels are migration fallback only, not coupled afterward
   if(!raw.roles?.lider && prev.roles?.lider)n.roles.lider=prev.roles.lider;
   if(!raw.channels?.logs && prev.channels?.logs)n.channels.logs=prev.channels.logs;
   prev.panels[p]=n;
  }
 }
 g.applications??={};g.registrations??={};g.teams??={};g.warnings??={};g.movements??={};g.nextSerial??=1;
 g.schemaVersion=5;return g;
}
function cfg(g,m,p){if(!MODULES[m]||!PANELS[p])throw new Error('Módulo/painel inválido.');return g.modules[m].panels[p];}
function secureText(s,max=1000){return String(s??'').replace(/@/g,'@\u200b').replace(/`/g,'ˈ').slice(0,max);}
function validateBannerUrl(s){if(!s||s==='padrao')return null;let u;try{u=new URL(s);}catch{throw new Error('Use um link HTTPS direto para o GIF.');}if(u.protocol!=='https:'||!u.pathname.toLowerCase().endsWith('.gif'))throw new Error('O banner deve ser um link HTTPS direto terminado em .gif.');return s.slice(0,400);}
module.exports={MODULES,PANELS,TURNS,defaultGuild,migrateGuild,cfg,secureText,validateBannerUrl};
