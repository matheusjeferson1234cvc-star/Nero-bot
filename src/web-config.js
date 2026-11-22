'use strict';
const core=require('./core');
const schema=require('./bot-config-schema');
function apply(g,raw,revision){
 if(!raw)return {changed:false,applied:false};
 const current=schema.normalize(g.settings);
 // Sites antigos ainda não enviam os campos de presença: preservar a escolha feita no Discord.
 const cfg=schema.normalize({...raw,presenceLogChannelId:raw.presenceLogChannelId===undefined?current.presenceLogChannelId:raw.presenceLogChannelId,
  presenceReportsEnabled:raw.presenceReportsEnabled===undefined?current.presenceReportsEnabled:raw.presenceReportsEnabled});
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
