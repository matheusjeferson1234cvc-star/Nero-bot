'use strict';
// Comprovante individual em PNG (estilo dark), gerado ao encerrar um ponto.
const core=require('./core');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=(s,n=55)=>escape(String(s||'').slice(0,n));
const initials=s=>String(s||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase().replace(/[^A-ZÀ-Ý]/g,'').slice(0,2)||'?';
const date=(ms,tz)=>ms?new Intl.DateTimeFormat('pt-BR',{timeZone:tz||'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'—';
const {recordedTimes}=require('./receipt-time');
const duration=(ms)=>{let sec=Math.max(0,Math.round(ms/1000)); const h=Math.floor(sec/3600);sec%=3600;const m=Math.floor(sec/60);return `${h}h ${String(m).padStart(2,'0')}min ${String(sec%60).padStart(2,'0')}s`;};
function template(card,member,displayName='Membro',options={}) {
 const times=recordedTimes(card,member);
 const worked=duration(core.durationFor(member,times.end||Date.now()));
 const start=date(times.start,options.timezone),end=date(times.end,options.timezone);
 const pauses=(card.history||[]).filter(x=>x.event==='paused').length;
 const isExtra=member.type==='extra',color=isExtra?'#b580ff':'#fb6575';
 const plainShift=v=>String(v||'').replace(/[^A-Za-zÀ-ÿ0-9\s-]/g,'').trim();
 const className=isExtra?`HORA EXTRA • ORIGEM: ${short(plainShift(core.SHIFTS[member.originShift]||'Outro turno'))}`:'HORAS NORMAIS';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1010" viewBox="0 0 800 1010">
 <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07090c"/><stop offset="1" stop-color="#141018"/></linearGradient></defs>
 <rect width="800" height="1010" fill="#08090c"/><rect width="800" height="1010" rx="28" fill="url(#bg)"/>
 <rect width="800" height="8" fill="${color}"/><rect x="24" y="24" width="752" height="962" rx="25" stroke="#35343a" stroke-width="2" fill="none"/>
 <circle cx="133" cy="165" r="79" fill="#27212c" stroke="#665b70" stroke-width="2"/>
 <text x="133" y="183" font-size="50" text-anchor="middle" font-family="DejaVu Sans,sans-serif" fill="#a39aac">${escape(initials(displayName))}</text>
 <text x="247" y="123" font-size="37" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="#f7f7f8">${short(displayName,28)}</text>
 <text x="248" y="159" font-size="20" font-family="DejaVu Sans,sans-serif" fill="#b4aab8">${options.username?'@'+short(options.username,18)+'  •  ':''}${short(card.name,24)}</text>
 <rect x="248" y="186" width="445" height="51" rx="23" fill="#26171d" stroke="${color}" stroke-width="2"/>
 <circle cx="274" cy="211" r="7" fill="${color}"/><text x="296" y="218" font-size="21" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="${color}">PONTO ENCERRADO</text>
 <line x1="58" y1="285" x2="742" y2="285" stroke="#33343a" stroke-width="2"/>
 <text x="58" y="346" font-size="36" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="#fcfbff">Comprovante de Bate-Ponto</text>
 <text x="58" y="391" font-size="19" font-family="DejaVu Sans,sans-serif" fill="#a49cac">CARTÃO ${short(card.id,22)}   •   ${short(plainShift(core.SHIFTS[card.shift]),24)}</text>
 <text x="58" y="431" font-size="18" font-family="DejaVu Sans,sans-serif" fill="${color}">${className}</text>
 <text x="58" y="519" font-size="19" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="#97949e">INÍCIO</text>
 <text x="58" y="561" font-size="28" font-family="DejaVu Sans,sans-serif" fill="#f5f5f8">${short(start,30)}</text>
 <text x="58" y="637" font-size="19" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="#97949e">ENCERRAMENTO</text>
 <text x="58" y="679" font-size="28" font-family="DejaVu Sans,sans-serif" fill="#f5f5f8">${short(end,30)}</text>
 <line x1="58" y1="727" x2="742" y2="727" stroke="#33343a" stroke-width="2"/>
 <text x="58" y="793" font-size="19" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="#97949e">TEMPO VÁLIDO</text>
 <text x="58" y="846" font-size="36" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="${color}">${worked}</text>
 <text x="554" y="793" font-size="19" font-weight="bold" font-family="DejaVu Sans,sans-serif" fill="#97949e">PAUSAS</text>
 <text x="554" y="846" font-size="33" font-family="DejaVu Sans,sans-serif" fill="#f2f0f5">${pauses}</text>
 <text x="58" y="940" font-size="16" font-family="DejaVu Sans,sans-serif" fill="#77737c">CENTRAL DE HORAS  •  COMPROVANTE DIGITAL</text>
 </svg>`;
}
// Retorna metadados para diagnosticar quando a CDN do Discord não entrega a foto.
async function generateDetailed(card,member,displayName,options={}) {
 let sharp;
 try { sharp=require('sharp'); }
 catch(e) {
  // Em hospedagens que falham ao carregar o módulo nativo, nunca voltar só a texto.
  return {buffer:require('./receipt-png-fallback').produce(card,member,displayName,options),avatarIncluded:false,reason:`Gerador alternativo: ${e.code||e.message}`};
 }
 const output=()=>sharp(Buffer.from(template(card,member,displayName,options))).png().toBuffer();
 const urls=[...(options.avatarUrls||[]),options.avatarUrl].filter((url,i,a)=>typeof url==='string'&&/^https:\/\//.test(url)&&a.indexOf(url)===i).slice(0,3);
 let reason=urls.length?'Foto não retornada pela CDN':'Perfil sem URL de avatar';
 for(const url of urls){
  try {
   const res=await (options.fetchAvatar||fetch)(url,{signal:AbortSignal.timeout(4000),headers:{'User-Agent':'CentralDePonto/3.6.2'}});
   if(!res.ok)throw Error('CDN HTTP '+res.status);
   const advertised=Number(res.headers?.get?.('content-length')||0);
   if(advertised>2_000_000)throw Error('Foto maior que o limite');
   const image=Buffer.from(await res.arrayBuffer());
   if(!image.length||image.length>2_000_000)throw Error('Foto vazia ou muito grande');
   const mask=Buffer.from('<svg width="150" height="150"><circle cx="75" cy="75" r="74" fill="white"/></svg>');
   const avatar=await sharp(image).resize(150,150,{fit:'cover'}).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
   const buffer=await sharp(Buffer.from(template(card,member,displayName,options))).composite([{input:avatar,left:58,top:90}]).png().toBuffer();
   return {buffer,avatarIncluded:true,reason:null};
  } catch(e) { reason=e.message; }
 }
 try {return {buffer:await output(),avatarIncluded:false,reason};}
 catch(e){return {buffer:require('./receipt-png-fallback').produce(card,member,displayName,options),avatarIncluded:false,reason:`Gerador alternativo: ${e.message}`};}
}
async function generate(card,member,displayName,options={}) {
 return (await generateDetailed(card,member,displayName,options)).buffer;
}
module.exports={generate,generateDetailed,template,recordedTimes};
