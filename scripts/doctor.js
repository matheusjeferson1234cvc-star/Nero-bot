'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let failures=[];
function check(name,fn){try{fn();console.log('✅',name);}catch(err){failures.push(name);console.error('❌',name,err.message);}}
check('package.json válido',()=>JSON.parse(read('package.json')));
check('Entrada index.js existente',()=>{if(!fs.existsSync(path.join(root,'index.js')))throw Error('index.js ausente');});
check('4 comandos',()=>{const src=read('src/commands.js');for(const x of ['painelregistro','painelrecrutamento','painelgestao','painelbateponto'])if(!src.includes(`'${x}'`))throw Error(x);});
check('Arquivos da Discloud na raiz',()=>{if(!read('discloud.config').includes('VERSION=latest'))throw Error('VERSION ausente');});
check('GIFs de cada painel',()=>{for(const m of ['org','policia'])for(const p of ['registro','recrutamento','gestao','bateponto']){
 const file=fs.readFileSync(path.join(root,'assets','banners',`${m}-${p}.gif`));if(file.toString('ascii',0,6)!=='GIF89a')throw Error(`${m}-${p}`);
}});
check('Sem token e sem banco privado',()=>{for(const s of ['.env','data/database.json'])if(fs.existsSync(path.join(root,s)))throw Error(`${s} detectado`);});
if(failures.length){console.error('Falhas:',failures.join(', '));process.exitCode=1;}else console.log('✅ Estrutura local verificada (não substitui teste conectado à Discloud/Discord).');
