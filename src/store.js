'use strict';
const fs=require('node:fs'),path=require('node:path');
const core=require('./core');
const dir=path.resolve(process.env.DATA_DIR||path.join(__dirname,'..','data'));
const file=path.join(dir,'database.json'),backup=file+'.bak';
function load(){
 for(const f of [file,backup])if(fs.existsSync(f)){
  try {const obj=JSON.parse(fs.readFileSync(f,'utf8'));if(obj&&typeof obj.guilds==='object'&&!Array.isArray(obj.guilds))return obj;}catch(e){console.error('Banco inválido em',f,e.message);}
 }
 return {guilds:{}};
}
const db=load();
function get(guildId){db.guilds[guildId]??=core.defaultGuild();return core.padGuild(db.guilds[guildId]);}
function save(){
 fs.mkdirSync(dir,{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2),{mode:0o600});
 if(fs.existsSync(file))try{const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old&&old.guilds)fs.copyFileSync(file,backup);}catch{}
 fs.renameSync(tmp,file);
}
module.exports={get,save,paths:{file,backup}};
