
'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
test('manifesto Node, entrada e configuração da hospedagem são coerentes',()=>{
 const pkg=require('../package.json');const config=fs.readFileSync(path.join(root,'discloud.config'),'utf8');
 assert.equal(pkg.main,'index.js');assert.equal(pkg.scripts.start,'node index.js');
 for(const field of ['TYPE=bot','MAIN=index.js','VERSION=latest'])assert.ok(config.includes(field));
 for(const dep of ['discord.js','dotenv'])assert.ok(pkg.dependencies[dep]);
});
test('26 banners da Organização e da Polícia presentes',()=>{
 const types=Object.keys(require('../src/config').TYPES);
 for(const m of ['org','policia'])for(const type of types){
   const f=path.join(root,'assets','animados',`${m}-${type}.gif`);assert.ok(fs.existsSync(f),f);
   assert.equal(fs.readFileSync(f).subarray(0,3).toString('ascii'),'GIF');
 }
});
test('código não contém um Dockerfile próprio com FROM node:undefined',()=>{
 for(const f of ['Dockerfile','dockerfile'])if(fs.existsSync(path.join(root,f)))assert.ok(!fs.readFileSync(path.join(root,f),'utf8').includes('node:undefined'));
});
