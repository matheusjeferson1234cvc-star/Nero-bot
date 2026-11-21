"""Gera GIFs curtos, leves e com texto legível usando artes originais já criadas para o projeto."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import math
root=Path(__file__).parent
sources={
 'org': root/'assets'/'banner-organizacao.png',
 'policia': root/'assets'/'banner-policia.png',
}
titles={
 'central':('CENTRAL RP','ACESSO AOS SISTEMAS'),
 'recrutamento':('RECRUTAMENTO','CANDIDATURAS E APROVACAO'),
 'registro':('REGISTRO RP','CADASTRO DE PERSONAGEM'),
 'suporte':('SUPORTE','TICKETS E RELATORIOS'),
 'plantao':('BATE-PONTO','CONTROLE DE SERVICO'),
 'status':('EQUIPE ONLINE','QUEM ESTA EM SERVICO'),
 'whitelist':('WHITELIST','ENTRADA NO ROLEPLAY'),
 'rg':('RG RP','DOCUMENTO FICTICIO'),
 'punicoes':('ADVERTENCIAS','REGISTRO DE OCORRENCIAS RP'),
 'gestao':('GESTAO E DISCIPLINA','PROMOCAO • REBAIXAMENTO • ADVERTENCIA'),
 'ranking':('RANKING','HORAS E CONQUISTAS RP'),
}
font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font_sub='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
W,H=900,270
out=root/'assets'/'animados';out.mkdir(exist_ok=True,parents=True)
for mod,source in sources.items():
    original=Image.open(source).convert('RGB')
    sw,sh=original.size
    # Text on original is blurred to act as texture rather than part of the new design.
    crop=original.crop((0, int(sh*.09), sw, int(sh*.78))).resize((W,H)).filter(ImageFilter.GaussianBlur(11))
    shade=Image.new('RGB',(W,H),(5,7,14))
    bg=Image.blend(crop,shade,0.76)
    neon=(176,81,255) if mod=='org' else (46,154,255)
    label='ORGANIZACAO RP' if mod=='org' else 'POLICIA RP'
    for typ,(title,subtitle) in titles.items():
        frames=[]
        for n in range(9):
            im=bg.copy().convert('RGBA')
            overlay=Image.new('RGBA',(W,H),(0,0,0,0))
            d=ImageDraw.Draw(overlay)
            # A faixa iluminada percorre o banner: animação genuína e contínua.
            offset=int((n/9)* (W+360))-180
            for step in range(160):
                x=offset+step
                alpha=int(48*(1-abs(step-80)/80))
                if 0<=x<W:
                    d.line([(x,0),(x-150,H)],fill=(*neon,max(0,alpha)),width=2)
            d.line([(0,6),(W,6)],fill=(*neon,200),width=4)
            d.line([(0,H-8),(W,H-8)],fill=(*neon,200),width=4)
            for k in range(13):
                x=(71*k+int(17*n))%W
                y=(19*k+47)%H
                r=1+((n+k)%3)
                d.ellipse((x-r,y-r,x+r,y+r), fill=(*neon,70+10*r))
            im=Image.alpha_composite(im,overlay)
            d=ImageDraw.Draw(im)
            d.rounded_rectangle([28,30,268,69],radius=12, fill=(*neon,58),outline=(*neon,175),width=1)
            d.text((43,38), 'CETUS RP  |  '+label, font=ImageFont.truetype(font_sub,15), fill=(232,238,248,255))
            sz=57 if len(title)<17 else 43
            ft=ImageFont.truetype(font,sz)
            # Dark crisp shadow and glowing accent.
            d.text((39,92),title,font=ft,fill=(0,0,0,220),stroke_width=4,stroke_fill=(0,0,0,230))
            d.text((36,89),title,font=ft,fill=(246,248,255,255),stroke_width=1,stroke_fill=(*neon,220))
            d.text((40,190),subtitle,font=ImageFont.truetype(font_sub,19),fill=(197,207,225,255))
            d.rounded_rectangle([38,224,240,232],radius=4,fill=(*neon,230))
            d.text((W-143,H-43),'ANIMADO  •  V2',font=ImageFont.truetype(font_sub,13),fill=(189,197,218,255))
            # Palette optimized for size and Discord GIF playback.
            frames.append(im.convert('RGB').quantize(colors=80,method=Image.Quantize.FASTOCTREE))
        target=out/f'{mod}-{typ}.gif'
        frames[0].save(target,save_all=True,append_images=frames[1:],duration=125,loop=0,optimize=True,disposal=2)
        print(target.name,round(target.stat().st_size/1024),'KB')
print('Total:',len(list(out.glob('*.gif'))))
