from pathlib import Path
import re
import html
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image as PdfImage
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/WEB_COMPLETION_REVIEW_20261106.md'
OUT = ROOT / 'output/pdf/HUBBY_Ra_soat_va_hoan_thien_web_20261106.pdf'
QA = Path(__file__).resolve().parent / 'qa'
OUT.parent.mkdir(parents=True, exist_ok=True)
QA.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFont(TTFont('ArialItalic', 'C:/Windows/Fonts/ariali.ttf'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='ArialBold', italic='ArialItalic', boldItalic='ArialBold')
ink = colors.HexColor('#202434')
purple = colors.HexColor('#59417C')
styles = {
    'body': ParagraphStyle('body', fontName='Arial', fontSize=10, leading=14.4, textColor=ink, spaceAfter=7, splitLongWords=True),
    'title': ParagraphStyle('title', fontName='ArialBold', fontSize=25, leading=31, textColor=colors.black, spaceAfter=18),
    'h1': ParagraphStyle('h1', fontName='ArialBold', fontSize=17, leading=22, textColor=purple, spaceBefore=10, spaceAfter=12, keepWithNext=True),
    'h2': ParagraphStyle('h2', fontName='ArialBold', fontSize=11.8, leading=16, textColor=purple, spaceBefore=12, spaceAfter=8, keepWithNext=True),
    'bullet': ParagraphStyle('bullet', fontName='Arial', fontSize=10, leading=14.4, textColor=ink, leftIndent=12, firstLineIndent=-8, spaceAfter=6, splitLongWords=True),
}

def inline(text):
    text = html.escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`([^`]+)`', r'<font color="#4F4267">\1</font>', text)
    return text

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.states = []
    def showPage(self):
        self.states.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        count = len(self.states)
        for state in self.states:
            self.__dict__.update(state)
            self.setFont('Arial', 8)
            self.setFillColor(colors.HexColor('#797583'))
            self.drawString(48, 26, 'HUBBY | Rà soát website | 06/11/2026')
            self.drawRightString(A4[0]-48, 26, f'{self._pageNumber} / {count}')
            super().showPage()
        super().save()

lines = SOURCE.read_text(encoding='utf-8').splitlines()
story = []
paragraph = []
def flush():
    if paragraph:
        story.append(Paragraph(inline(' '.join(paragraph)), styles['body']))
        paragraph.clear()

for line in lines:
    if not line.strip():
        flush()
    elif line.startswith('# '):
        flush()
        story.append(Paragraph(inline(line[2:]), styles['title']))
    elif line.startswith('## '):
        flush()
        # Major sections begin on a new page for navigation and printing.
        section = int(re.match(r'## (\d+)', line).group(1))
        if section in (5, 6, 7, 9, 13):
            story.append(PageBreak())
        story.append(Paragraph(inline(line[3:]), styles['h1']))
    elif line.startswith('### '):
        flush()
        story.append(Paragraph(inline(line[4:]), styles['h2']))
    elif line.startswith('!['):
        flush()
        match = re.match(r'!\[([^]]*)\]\(([^)]+)\)', line)
        path = (SOURCE.parent / match.group(2)).resolve()
        with Image.open(path) as source_image:
            width, height = source_image.size
        story.append(Spacer(1, 10))
        story.append(PdfImage(str(path), width=499, height=499*height/width))
        story.append(Paragraph(inline(match.group(1)), styles['body']))
    elif line.startswith('- '):
        flush()
        story.append(Paragraph('• ' + inline(line[2:]), styles['bullet']))
    else:
        paragraph.append(line)
flush()

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=48, leftMargin=48,
    topMargin=43, bottomMargin=45, title='Rà soát và kế hoạch hoàn thiện website Hubby', author='Hubby',
    allowSplitting=True)
doc.build(story, canvasmaker=NumberedCanvas)
reader = PdfReader(str(OUT))
assert len(reader.pages) > 10
text = '\n'.join(p.extract_text() for p in reader.pages)
for required in ['F01', 'F20', 'C01', 'E06', 'Canva Education', 'Prompt 2', 'admin@hubby.dpdns.org']:
    assert required in text, required
pdf = pdfium.PdfDocument(str(OUT))
renders = []
for index in range(len(pdf)):
    page = pdf[index]
    img = page.render(scale=1.35).to_pil().convert('RGB')
    target = QA / f'page-{index+1:02d}.png'
    img.save(target)
    renders.append(img)
for start in range(0, len(renders), 4):
    chunk = renders[start:start+4]
    thumb_w = 625
    thumb_h = int(chunk[0].height * thumb_w / chunk[0].width)
    sheet = Image.new('RGB', (thumb_w*2, (thumb_h+28)*2), '#d6d6d6')
    draw = ImageDraw.Draw(sheet)
    for n, img in enumerate(chunk):
        x = n%2*thumb_w
        y = n//2*(thumb_h+28)
        draw.text((x+10,y+6), f'Page {start+n+1}', fill='black')
        sheet.paste(img.resize((thumb_w,thumb_h)), (x,y+28))
    sheet.save(QA/f'sheet-{start//4+1:02d}.png')
print(f'PDF: {OUT}')
print(f'Pages: {len(reader.pages)}')
print(f'QA sheets: {(len(renders)+3)//4}')
