'use strict';
const core=require('./core');
const schema=require('./bot-config-schema');
function apply(g,raw,revision){
 if(!raw)return {changed:false,applied:false};
 const current=schema.normalize(g.settings);
 // Uma configuração antiga do site não deve desfazer logs criados no bot
 // até que uma edição mais recente seja feita no site.
 const keepLogs=Number.isInteger(g.logsProvisionedRevision)&&(!Number.isInteger(revision)||revision<=g.logsProvisionedRevision);
 const source=keepLogs?{...raw,auditChannelId:current.auditChannelId,presenceLogChannelId:current.presenceLogChannelId,
  shifts:Object.fromEntries(schema.SHIFTS.map(k=>[k,{...raw.shifts[k],logChannelId:current.shifts[k].logChannelId}]))}:raw;
 // Sites antigos ainda não enviam os campos de presença: preservar a escolha feita no Discord.
 const cfg=schema.normalize({...source,presenceLogChannelId:source.presenceLogChannelId===undefined?current.presenceLogChannelId:source.presenceLogChannelId,
  presenceReportsEnabled:source.presenceReportsEnabled===undefined?current.presenceReportsEnabled:source.presenceReportsEnabled});
 const changed=JSON.stringify(cfg)!==JSON.stringify(current);
 if(changed){
  const prev=g.settings;
  const wasWarning=prev.justifications.autoWarnings;
  g.settings={...prev,...cfg,shifts:Object.fromEntries(schema.SHIFTS.map(k=>[k,{...prev.shifts[k],...cfg.shifts[k]}])),
   justifications:{...prev.justifications,...cfg.justifications},panel:{...prev.panel,...cfg.panel},notifications:{...prev.notifications,...cfg.notifications}};
  if(wasWarning!==cfg.justifications.autoWarnings){const runtime=require('./attendance-runtime');runtime.setupWarning(g,cfg.justifications.autoWarnings);}
 }
 const newRevision=Number.isInteger(revision)&&revision>=0?revision:0;
 const applied=g.siteConfigRevision!==newRevision;
 g.siteConfigRevision=newRevision;
 return {changed,applied};
}
module.exports={apply};
