'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=['index.js','src/bot.js','src/core.js','src/store.js','src/ui.js','package.json','discloud.config','assets/central-de-ponto.gif'];
for(const name of files){const p=path.join(root,name);if(!fs.existsSync(p))throw Error(`Falta arquivo ${name}`);if(name.endsWith('.js'))cp.execFileSync(process.execPath,['--check',p]);}
const gif=fs.readFileSync(path.join(root,'assets/central-de-ponto.gif'));if(!['GIF89a','GIF87a'].includes(gif.toString('ascii',0,6)))throw Error('Banner animado inválido.');
const pkg=require(path.join(root,'package.json'));if(!pkg.dependencies?.['discord.js']||pkg.main!=='index.js')throw Error('Dependências / main inválidos.');
const code=fs.readFileSync(path.join(root,'src/bot.js'),'utf8');
for(const btn of ['bp:toggle','bp:pause','bp:team','bp:mine','bp:config']){
 const ui=fs.readFileSync(path.join(root,'src/ui.js'),'utf8');if(!ui.includes(btn))throw Error('Botão ausente: '+btn);
}
if(!code.includes('GatewayIntentBits.GuildMembers'))throw Error('Falta intent para seleção filtrada por cargo.');
if(!code.includes('handleDM'))throw Error('Convites por DM ausentes.');
const cfg=fs.readFileSync(path.join(root,'discloud.config'),'utf8');if(!cfg.includes('MAIN=index.js')||!cfg.includes('VERSION='))throw Error('Discloud config incompleto.');
console.log('✅ Verificação estática: sintaxe, estrutura, GIF, botões e configurações, intents e comandos.');
