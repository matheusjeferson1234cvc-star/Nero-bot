'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const { spawnSync }=require('node:child_process');
const project=path.resolve(__dirname,'..');
function run(dir,js){
  const child=spawnSync(process.execPath,['-e',js],{cwd:project,env:{...process.env,DATA_DIR:dir},encoding:'utf8'});
  assert.equal(child.status,0,child.stderr||child.stdout);
  return child.stdout;
}
test('salvamento gera backup recuperável em diretório isolado',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cetus-test-'));
  try {
    run(dir,"const s=require('./src/store');const g=s.guildData('123');g.nextSerial=9;s.save();g.nextSerial=10;s.save();");
    const primary=path.join(dir,'database.json'),backup=primary+'.bak';
    assert.equal(JSON.parse(fs.readFileSync(primary)).guilds['123'].nextSerial,10);
    assert.ok(fs.existsSync(backup));
    assert.equal(JSON.parse(fs.readFileSync(backup)).guilds['123'].nextSerial,9);
    fs.writeFileSync(primary,'{quebrado');
    const out=run(dir,"const s=require('./src/store');const g=s.guildData('123');if(g.nextSerial!==9)process.exit(3);g.nextSerial=11;s.save();");
    assert.match(out,/^$/);
    assert.equal(JSON.parse(fs.readFileSync(primary)).guilds['123'].nextSerial,11);
    assert.equal(JSON.parse(fs.readFileSync(backup)).guilds['123'].nextSerial,9);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
