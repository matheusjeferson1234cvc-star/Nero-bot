from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
ROOT=Path(__file__).resolve().parent.parent
W,H=960,240
fontdir=Path('/usr/share/fonts/truetype/dejavu')
def font(n,bold=False):
    return ImageFont.truetype(str(fontdir/('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')),n)
def center(d,txt,xy,ft,color):
    d.text(xy,txt,font=ft,fill=color,anchor='mm')
def make(key,title,sub,accent):
    frames=[]
    for f in range(24):
        phase=2*math.pi*f/24
        im=Image.new('RGB',(W,H),(9,12,22));d=ImageDraw.Draw(im)
        for y in range(H):
            for x in range(0,W,4):
                glow=max(0,1-math.hypot((x-W*.23)/570,(y-H*.42)/175))
                sweep=(math.sin(x/95-y/38+phase)+1)*.5
                d.rectangle((x,y,x+3,y),fill=tuple(min(255,int(base+glow*a*.18+sweep*a*.025)) for base,a in zip((9,12,22),accent)))
        for n in range(12):
            x=(n*83+f*5)%W
            d.line((x-100,H,x+65,0),fill=(29,31,43),width=1)
        d.rounded_rectangle((16,16,W-17,H-17),radius=15,outline=(62,67,83),width=2)
        d.rectangle((17,42,22,H-42),fill=accent)
        d.rectangle((W-23,42,W-18,H-42),fill=accent)
        xx=48+int((W-156)*(1+math.sin(phase))/2)
        d.line((xx,18,xx+52,18),fill=accent,width=3)
        # Abstract raven crest in a circular seal; no weapons or real-world insignia.
        cx,cy=126,120
        d.ellipse((cx-71,cy-71,cx+71,cy+71),outline=(75,81,101),width=2)
        d.arc((cx-77,cy-77,cx+77,cy+77),start=f*15,end=f*15+85,fill=accent,width=5)
        d.polygon([(cx-48,cy-22),(cx-3,cy-5),(cx+45,cy-26),(cx+18,cy+20),(cx+9,cy+41),(cx-11,cy+20)],fill=(219,224,235))
        d.polygon([(cx-48,cy-22),(cx-12,cy-15),(cx-25,cy+2)],fill=accent)
        d.polygon([(cx+45,cy-26),(cx+11,cy-15),(cx+28,cy+1)],fill=accent)
        d.polygon([(cx-4,cy-12),(cx+13,cy-19),(cx+21,cy-7),(cx+8,cy-5),(cx+1,cy+11)],fill=(14,17,27))
        d.text((230,43),'N E R O   /   V 4 . 3',font=font(18,True),fill=accent)
        size=55
        while d.textlength(title,font=font(size,True))>680:size-=1
        d.text((228,75),title,font=font(size,True),fill=(245,247,251))
        d.text((231,149),sub,font=font(22),fill=(164,176,196))
        d.line((232,195,882,195),fill=(53,60,78),width=2)
        pos=232+int(560*(1+math.sin(phase))/2)
        d.line((pos,195,pos+85,195),fill=accent,width=4)
        frames.append(im.quantize(colors=96,method=Image.Quantize.MEDIANCUT))
    out=ROOT/'assets'/('nero-'+key+'.gif')
    frames[0].save(out,save_all=True,append_images=frames[1:],duration=90,loop=0,optimize=False,disposal=2)
    with Image.open(out) as g:
        assert g.n_frames==24
        for n in range(g.n_frames):g.seek(n);g.load()
    print(out.name,out.stat().st_size)
for item in [
 ('meeting','CENTRAL DE REUNIÕES','PRESENÇA  /  CONVOCAÇÕES  /  RELATÓRIOS',(246,72,86)),
 ('course','NERO ACADEMY','FORMAÇÃO  /  AVALIAÇÕES  /  RESULTADOS',(166,108,255)),
 ('support','ATENDIMENTO','SUPORTE  /  SOLICITAÇÕES  /  ORGANIZAÇÃO',(64,181,244)),
 ('join','BOAS-VINDAS','UMA NOVA JORNADA COMEÇA AQUI',(53,211,154)),
 ('leave','ATÉ LOGO','OBRIGADO POR FAZER PARTE',(248,98,103))
]:make(*item)
