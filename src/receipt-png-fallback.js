'use strict';
// Gerador PNG sem módulos nativos: funciona mesmo quando sharp/libvips
// não está disponível na hospedagem do bot. Não precisa de fontes externas.
const zlib=require('node:zlib');
const core=require('./core');
const {recordedTimes}=require('./receipt-time');
const letters={
 A:['01110','10001','10001','11111','10001','10001','10001'],
 B:['11110','10001','10001','11110','10001','10001','11110'],
 C:['01111','10000','10000','10000','10000','10000','01111'],
 D:['11110','10001','10001','10001','10001','10001','11110'],
 E:['11111','10000','10000','11110','10000','10000','11111'],
 F:['11111','10000','10000','11110','10000','10000','10000'],
 G:['01111','10000','10000','10111','10001','10001','01111'],
 H:['10001','10001','10001','11111','10001','10001','10001'],
 I:['11111','00100','00100','00100','00100','00100','11111'],
 J:['00111','00010','00010','00010','10010','10010','01100'],
 K:['10001','10010','10100','11000','10100','10010','10001'],
 L:['10000','10000','10000','10000','10000','10000','11111'],
 M:['10001','11011','10101','10101','10001','10001','10001'],
 N:['10001','11001','10101','10011','10001','10001','10001'],
 O:['01110','10001','10001','10001','10001','10001','01110'],
 P:['11110','10001','10001','11110','10000','10000','10000'],
 Q:['01110','10001','10001','10001','10101','10010','01101'],
 R:['11110','10001','10001','11110','10100','10010','10001'],
 S:['01111','10000','10000','01110','00001','00001','11110'],
 T:['11111','00100','00100','00100','00100','00100','00100'],
 U:['10001','10001','10001','10001','10001','10001','01110'],
 V:['10001','10001','10001','10001','10001','01010','00100'],
 W:['10001','10001','10001','10101','10101','10101','01010'],
 X:['10001','10001','01010','00100','01010','10001','10001'],
 Y:['10001','10001','01010','00100','00100','00100','00100'],
 Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10011','10101','10101','10101','11001','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],
 '6':['01110','10000','10000','11110','10001','10001','01110'],
 '7':['11111','00001','00010','00100','01000','01000','01000'],
 '8':['01110','10001','10001','01110','10001','10001','01110'],
 '9':['01110','10001','10001','01111','00001','00001','01110'],
 ':':['00000','00100','00100','00000','00100','00100','00000'],
 '/':['00001','00001','00010','00100','01000','10000','10000'],
 '-':['00000','00000','00000','11111','00000','00000','00000'],
 '.':['00000','00000','00000','00000','00000','00100','00100'],
 ' ':['00000','00000','00000','00000','00000','00000','00000'],
 '?':['01110','10001','00001','00010','00100','00000','00100'],
 '#':['01010','01010','11111','01010','11111','01010','01010'],
 '+':['00000','00100','00100','11111','00100','00100','00000'],
};
const W=800,H=1010;
function clean(text){return String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 :/.#+?\-]/g,' ').trim();}
function produce(card,member,displayName='Membro',options={}) {
 const pixels=Buffer.alloc(W*H*3);
 const colors={bg:[12,16,24],panel:[23,29,42],border:[58,67,88],white:[240,241,251],muted:[163,174,197],purple:[133,109,237],green:[72,203,155]};
 function rect(x,y,w,h,color){x=Math.max(0,Math.round(x));y=Math.max(0,Math.round(y));const right=Math.min(W,x+w),bottom=Math.min(H,y+h);for(let yy=y;yy<bottom;yy++){let idx=(yy*W+x)*3;for(let xx=x;xx<right;xx++){pixels[idx++]=color[0];pixels[idx++]=color[1];pixels[idx++]=color[2]}}}
 function letter(ch,x,y,scale,color){const glyph=letters[ch]||letters['?'];for(let ry=0;ry<7;ry++)for(let rx=0;rx<5;rx++)if(glyph[ry][rx]==='1')rect(x+rx*scale,y+ry*scale,scale,scale,color)}
 function txt(value,x,y,scale,color,max=38){const text=clean(value).slice(0,max),step=scale*6;let xx=x;for(const ch of text){if(xx+step>W-35)break;letter(ch,xx,y,scale,color);xx+=step}}
 const start=recordedTimes(card,member),fmtDate=ms=>ms?new Intl.DateTimeFormat('pt-BR',{timeZone:options.timezone||'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ms)):'--';
 const time=Math.max(0,core.durationFor(member,start.end||Date.now())),h=Math.floor(time/3600000),m=Math.floor((time%3600000)/60000),s=Math.floor((time%60000)/1000);
 const worked=`${h}H ${String(m).padStart(2,'0')}MIN ${String(s).padStart(2,'0')}S`;
 rect(0,0,W,H,colors.bg);rect(0,0,W,9,colors.purple);rect(32,36,W-64,H-76,colors.panel);rect(34,38,W-68,H-80,colors.bg);
 txt('CENTRAL DE HORAS',62,66,5,colors.white);txt('COMPROVANTE DIGITAL',62,120,2,colors.muted);
 rect(55,165,690,70,colors.panel);txt('PONTO ENCERRADO',81,181,5,colors.green);
 const field=(label,value,y,scale=4)=>{txt(label,65,y,3,colors.muted);txt(value,65,y+39,scale,colors.white,40)};
 field('MEMBRO',displayName,275,4);
 field('CARTAO',card.id,380,3);
 field('TURNO',core.SHIFTS[card.shift]||card.shift,475,4);
 field('TIPO',member.type==='extra'?'HORAS EXTRAS':'HORAS NORMAIS',567,4);
 field('INICIO',fmtDate(start.start),657,4);
 field('ENCERRAMENTO',fmtDate(start.end),750,4);
 rect(58,835,684,92,colors.panel);
 txt('TEMPO VALIDO',76,850,2,colors.muted);
 txt(worked,76,876,4,colors.green);
 txt('PAUSAS '+(card.history||[]).filter(x=>x.event==='paused').length,76,946,2,colors.muted);
 return encodePNG(pixels,W,H);
}
function encodePNG(pixels,width,height){
 const crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
 function chunk(kind,data){const name=Buffer.from(kind),len=Buffer.alloc(4);len.writeUInt32BE(data.length);let crc=0xffffffff;for(const b of Buffer.concat([name,data]))crc=crcTable[(crc^b)&255]^(crc>>>8);const last=Buffer.alloc(4);last.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([len,name,data,last])}
 const head=Buffer.alloc(13);head.writeUInt32BE(width,0);head.writeUInt32BE(height,4);head[8]=8;head[9]=2;
 const raw=Buffer.alloc(height*(1+width*3));for(let y=0;y<height;y++)pixels.copy(raw,y*(1+width*3)+1,y*width*3,(y+1)*width*3);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw,{level:7})),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={produce,encodePNG,clean};
