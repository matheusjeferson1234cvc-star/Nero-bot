'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
class Builder {
 constructor(){this.components=[];this.options={};}
 setCustomId(v){this.options.id=v;return this;}
 setTitle(v){this.options.title=v;return this;}
 setLabel(v){this.options.label=v;return this;}
 setDescription(v){this.options.desc=v;return this;}
 setTextInputComponent(v){this.components.push(v);return this;}
 setFileUploadComponent(v){this.components.push(v);return this;}
 setStyle(v){this.options.style=v;return this;}
 setRequired(v){this.options.required=v;return this;}
 setMaxLength(v){this.options.max=v;return this;}
 setMinLength(v){this.options.min=v;return this;}
 setMinValues(v){this.options.min=v;return this;}
 setMaxValues(v){this.options.max=v;return this;}
 setPlaceholder(v){this.options.placeholder=v;return this;}
 setValue(v){this.options.value=v;return this;}
 addLabelComponents(...items){this.components.push(...items);return this;}
}
const original=Module._load;let modals;
try{
 Module._load=function(request,parent,...args){
  if(request==='discord.js')return {ModalBuilder:Builder,LabelBuilder:Builder,TextInputBuilder:Builder,FileUploadBuilder:Builder,TextInputStyle:{Short:1,Paragraph:2}};
  return original.call(this,request,parent,...args);
 };
 delete require.cache[require.resolve('../src/modals')];modals=require('../src/modals');
}finally{Module._load=original;}
test('modais de recrutamento e registro têm upload fictício opcional',()=>{
 for(const kind of ['recrutamento','registro','whitelist','rg']){
  const modal=modals.makeModal(kind,'org');
  const uploads=modal.components.filter(label=>label.components[0]?.options.id==='rg_rp');
  assert.equal(uploads.length,1,kind);
  assert.equal(uploads[0].components[0].options.required,false);
  assert.ok(modal.components.length<=5);
 }
});
test('modal de ausência e advertência respeitam limite Discord',()=>{
 for(const kind of ['ausencias','punicoes']){
  const m=modals.makeModal(kind,'policia');
  assert.ok(m.components.length>=3 && m.components.length<=5);
  assert.ok(m.options.id.includes(kind));
 }
});
test('modal de motivo de promoção é privado e obrigatório',()=>{
 const m=modals.careerReasonModal('org','promocao');
 assert.equal(m.options.id,'careerreason:org:promocao');
 assert.equal(m.components.length,1);
 assert.equal(m.components[0].components[0].options.required,true);
});
