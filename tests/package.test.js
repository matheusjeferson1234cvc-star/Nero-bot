const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');
test('somente quatro comandos declarados no código',()=>{
 const code=fs.readFileSync(path.join(root,'src','commands.js'),'utf8');
 const matches=[...code.matchAll(/\['(painel[^']+)','/g)].map(x=>x[1]);assert.deepEqual(matches,['painelregistro','painelrecrutamento','painelgestao','painelbateponto']);
});
test('oito GIFs animados válidos, e nenhum banner com nome antigo no arquivo',()=>{
 for(const m of ['org','policia'])for(const p of ['registro','recrutamento','gestao','bateponto']){
  const f=fs.readFileSync(path.join(root,'assets','banners',`${m}-${p}.gif`));assert.equal(f.toString('ascii',0,6),'GIF89a');assert.ok(f.length>2000);
 }
 const ui=fs.readFileSync(path.join(root,'src','ui.js'),'utf8');assert.doesNotMatch(ui,/CETUS/i);
});
test('Discloud possui configuração Node válida e não empacota token',()=>{
 const s=fs.readFileSync(path.join(root,'discloud.config'),'utf8');assert.match(s,/VERSION=latest/);assert.match(s,/MAIN=index.js/);
 assert.ok(!fs.existsSync(path.join(root,'.env')));
});
