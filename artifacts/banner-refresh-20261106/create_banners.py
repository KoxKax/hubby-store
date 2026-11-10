from pathlib import Path
from html import escape
import importlib.util
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/visuals/editorial-20261106'
OUT.mkdir(parents=True, exist_ok=True)
FONTROOT = ROOT / 'node_modules/@fontsource/be-vietnam-pro/files'
fonts = {}
for weight in [400, 700]:
    fonts[weight] = [TTFont(str(FONTROOT/f'be-vietnam-pro-{subset}-{weight}-normal.woff'))
                     for subset in ['latin', 'vietnamese', 'latin-ext']]

def text(value, x, y, size, color, weight=700):
    parts = [f'<g aria-label="{escape(value)}" fill="{color}">']
    cursor = x
    for char in value:
        font = next((f for f in fonts[weight] if ord(char) in f.getBestCmap()), None)
        if font is None:
            raise ValueError(f'Missing glyph {char!r}')
        glyph = font.getBestCmap()[ord(char)]
        glyphs = font.getGlyphSet()
        pen = SVGPathPen(glyphs)
        glyphs[glyph].draw(pen)
        scale = size/font['head'].unitsPerEm
        parts.append(f'<path d="{pen.getCommands()}" transform="translate({cursor:.3f} {y}) scale({scale:.6f} {-scale:.6f})"/>')
        cursor += font['hmtx'][glyph][0]*scale
    parts.append('</g>')
    return ''.join(parts)

INK='#27213B'; CREAM='#F7F1E8'; LILAC='#C7B8EC'; MINT='#BDE9D4'; PEACH='#F0B99D'
def base(bg,title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img"><title>{escape(title)}</title><rect width="1200" height="800" fill="{bg}"/>'
def brand(color,number):
    return text('Hubby',76,104,45,color)+f'<path d="M232 76v28m-14-14h28m-24-10 20 20m0-20-20 20" fill="none" stroke="{color}" stroke-width="3"/>'+text(f'0{number} / DỊCH VỤ SỐ',842,98,23,color,400)
def arrow(x,y,color):
    return f'<path d="M{x} {y}h40m-15-15 15 15-15 15" stroke="{color}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'

a=base(INK,'Hubby — Dịch vụ số cho mỗi ngày')+brand(CREAM,1)
a+=text('Dịch vụ số.',76,286,100,CREAM)+text('Dễ chọn hơn.',76,410,94,LILAC)
# A graphic asterisk and a plain circular cutout: no simulated material.
a+=f'<g transform="translate(978 330)"><g fill="{PEACH}"><rect x="-27" y="-165" width="54" height="330" rx="5"/><rect x="-165" y="-27" width="330" height="54" rx="5"/><rect x="-27" y="-165" width="54" height="330" rx="5" transform="rotate(45)"/><rect x="-27" y="-165" width="54" height="330" rx="5" transform="rotate(-45)"/></g><circle r="66" fill="{INK}"/><circle r="30" fill="{MINT}"/></g>'
a+=text('Học tập. Làm việc. Giải trí.',80,548,37,CREAM,400)
a+=f'<path d="M80 598H1120" stroke="{CREAM}" stroke-opacity=".23"/>'
a+=text('Khám phá sản phẩm',80,675,31,MINT)+arrow(441,663,MINT)
a+=f'<circle cx="1105" cy="665" r="12" fill="{LILAC}"/>'
a+='</svg>'

b=base(LILAC,'Hubby — Thêm công cụ cho học tập và sáng tạo')+brand(INK,2)
b+=text('Ý tưởng hay.',76,286,91,INK)+text('Bắt đầu thôi.',76,403,91,INK)
b+=f'<g transform="translate(835 192) rotate(8 133 196)"><rect width="270" height="397" rx="5" fill="{CREAM}" stroke="{INK}" stroke-width="4"/><path d="M0 48h270" stroke="{INK}" stroke-width="4"/><circle cx="24" cy="24" r="6" fill="{PEACH}"/><circle cx="44" cy="24" r="6" fill="{LILAC}"/><rect x="24" y="73" width="222" height="124" rx="2" fill="{PEACH}"/><circle cx="135" cy="135" r="43" fill="{INK}"/><path d="m122 109 37 26-37 26z" fill="{CREAM}"/><path d="M26 226h158M26 247h213M26 268h183" stroke="{INK}" stroke-width="7"/><rect x="25" y="304" width="100" height="67" fill="{MINT}"/><rect x="142" y="304" width="102" height="67" fill="{LILAC}"/></g>'
b+=f'<path d="m773 448 13 103 28-25 30 42 24-18-29-40 33-9z" fill="{MINT}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>'
b+=text('Công cụ cho học tập',80,534,35,INK,400)+text('và sáng tạo mỗi ngày.',80,585,35,INK,400)
b+=text('Tìm gói bạn cần',80,675,31,INK)+arrow(366,663,INK)
b+='</svg>'

c=base(PEACH,'Hubby — Hỗ trợ sản phẩm và đơn hàng')+brand(INK,3)
c+=text('Cần hỗ trợ?',76,286,91,INK)+text('Có Hubby đây.',76,403,85,INK)
c+=f'<path d="M875 203h193a22 22 0 0 1 22 22v134a22 22 0 0 1-22 22h-100l-57 53v-53h-36a22 22 0 0 1-22-22V225a22 22 0 0 1 22-22z" fill="{MINT}" stroke="{INK}" stroke-width="4"/><circle cx="913" cy="290" r="10" fill="{INK}"/><circle cx="972" cy="290" r="10" fill="{INK}"/><circle cx="1031" cy="290" r="10" fill="{INK}"/>'
c+=f'<path d="M831 449h164a18 18 0 0 1 18 18v91a18 18 0 0 1-18 18h-48v36l-41-36h-75a18 18 0 0 1-18-18v-91a18 18 0 0 1 18-18z" fill="{CREAM}" stroke="{INK}" stroke-width="4"/><path d="m878 513 23 23 47-49" stroke="{INK}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
c+=text('Tra đơn. Gửi yêu cầu.',80,548,37,INK,400)
c+=f'<path d="M80 598H720" stroke="{INK}" stroke-opacity=".25"/>'
c+=text('Xem hỗ trợ đơn hàng',80,675,31,INK)+arrow(454,663,INK)
c+='</svg>'

spec=importlib.util.spec_from_file_location('svg_loop',r'C:/Users/Admin/.codex/skills/svg-creator/scripts/svg_loop.py')
loop=importlib.util.module_from_spec(spec); spec.loader.exec_module(loop)
loop.STATE_FILE=str(OUT/'render-state.json')
loop.OUTPUT_DIR=str(OUT/'source')
for number,svg in enumerate([a,b,c],1):
    name=f'hubby-banner-{number}'
    path=OUT/f'{name}.svg'
    path.write_text(svg,encoding='utf-8')
    loop.PREVIEW_PNG=str(OUT/f'{name}-preview.png')
    loop.cmd_render(str(path))
    import cairosvg
    cairosvg.svg2png(bytestring=svg.encode(),write_to=str(OUT/f'{name}-1200.png'),output_width=1200,output_height=800)
    with Image.open(OUT/f'{name}-1200.png') as im:
        im.convert('RGB').save(OUT/f'{name}-1200.webp',quality=93,method=6)
        im.resize((768,512),Image.Resampling.LANCZOS).convert('RGB').save(OUT/f'{name}-768.webp',quality=93,method=6)
    loop.cmd_finish(str(path),f'{name}.svg')

sheet=Image.new('RGB',(1200,3*800),'white')
for i in range(3):
    with Image.open(OUT/f'hubby-banner-{i+1}-1200.webp') as im:
        sheet.paste(im,(0,i*800))
sheet.save(OUT/'three-banners-preview.jpg',quality=94)
print(OUT)
