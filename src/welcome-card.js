'use strict';
const sharp=require('sharp'),fs=require('node:fs'),path=require('node:path');
const esc=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const short=(s,n)=>Array.from(String(s??'')).slice(0,n).join('');
let fonts;
function loadFonts(){
 if(fonts)return fonts;
 const opentype=require('opentype.js'),root=path.dirname(require.resolve('@fontsource/noto-sans/400.css'));
 const read=(weight,subset)=>{const b=fs.readFileSync(path.join(root,'files','noto-sans-'+subset+'-'+weight+'-normal.woff'));return opentype.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
 const load=weight=>['latin','latin-ext','cyrillic','greek'].map(subset=>read(weight,subset));
 fonts={400:load(400),700:load(700)};return fonts;
}
function outline(value,y,size,weight,fill,maxWidth=840){
 const list=loadFonts()[weight];
 const chars=Array.from(String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' '));
 const glyphs=chars.map(ch=>{const font=list.find(f=>f.charToGlyphIndex(ch)!==0);return font?{font,g:font.charToGlyph(ch)}:{font:list[0],g:list[0].charToGlyph('?')};});
 const advance=(v,sz)=>v.g.advanceWidth/v.font.unitsPerEm*sz;
 const width=sz=>glyphs.reduce((sum,v)=>sum+advance(v,sz),0);
 if(width(size)>maxWidth)size=Math.max(12,Math.floor(size*maxWidth/width(size)));
 let x=(960-width(size))/2;const paths=[];
 for(const v of glyphs){const d=v.g.getPath(x,y,size).toPathData(2);if(d)paths.push('<path fill="'+fill+'" d="'+d+'"/>');x+=advance(v,size);}
 return paths.join('');
}
async function avatar(url,size){try{const response=await fetch(url,{signal:AbortSignal.timeout(3500)});if(!response.ok)return null;const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2_000_000)return null;return await sharp(bytes).resize(size,size,{fit:'cover'}).ensureAlpha().composite([{input:Buffer.from('<svg width="'+size+'" height="'+size+'"><circle cx="'+size/2+'" cy="'+size/2+'" r="'+size/2+'" fill="white"/></svg>'),blend:'dest-in'}]).png().toBuffer();}catch{return null;}}
function cardSvg(member,kind,cfg){
 const join=kind==='join',accent=/^#[0-9a-f]{6}$/i.test(cfg.color)?cfg.color:join?'#16a34a':'#dc2626';
 const name=short(member.user.globalName||member.user.username,48),guild=short(member.guild.name,60),count=Number.isSafeInteger(member.guild.memberCount)?member.guild.memberCount:null;
 const title=short(String(cfg.title|| (join?'Bem-vindo(a)!':'Até logo!')).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').trim()||(join?'Bem-vindo(a)!':'Até logo!'),60).toUpperCase();
 const text=outline(title,258,34,700,accent)+outline(name,313,40,700,'#ffffff')+outline(guild,359,26,400,'#c7cbd1')+outline(count===null?'Total indisponível':'Agora somos '+count+' '+(count===1?'membro':'membros'),425,26,400,'#d1d5db');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 960 480"><defs><linearGradient id="bar"><stop stop-color="#3549de"/><stop offset="1" stop-color="#8058ff"/></linearGradient><clipPath id="card"><rect width="960" height="480" rx="52"/></clipPath></defs><g clip-path="url(#card)"><rect width="960" height="480" fill="#23272b"/><rect width="960" height="11" fill="url(#bar)"/><circle cx="480" cy="142" r="78" fill="#14171c" stroke="#ffffff" stroke-width="5"/>'+outline(short(member.user.username,1).toUpperCase(),155,40,700,'#aaa')+text+'</g></svg>';
}
async function welcomeCard(member,kind,cfg){
 const svg=Buffer.from(cardSvg(member,kind,cfg));
 const layers=[];if(cfg.avatar){const a=await avatar(member.user.displayAvatarURL({extension:'png',size:256}),148);if(a)layers.push({input:a,left:406,top:68});}if(member.guild.iconURL()){const g=await avatar(member.guild.iconURL({extension:'png',size:128}),52);if(g)layers.push({input:g,left:28,top:28});}
 return await sharp(svg).composite(layers).png().toBuffer();
}
module.exports={welcomeCard,esc,cardSvg};
