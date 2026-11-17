"""Combine K.Toey's 'BigC FF Renovation 2027.pptx' with the FF Renovate Survey user manual (ffr-manual, USER edition:
no budget / BOQ money / report section) as extra slides on Toey's own Big C layouts.
Sources: Manual_FFR_src/manual.template.html (USER parts) + shots/*_u screenshots + survey config (cfg.json dumped from
FfRenovateSurvey.gs). Output: 'BigC FF Renovation 2027 + MTN Manual.pptx' (Toey's original file is not modified).
  python build_ff_combined_deck.py <cfg.json> <img_cache_dir>
"""
import json, os, sys, copy
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'BigC FF Renovation 2027.pptx')
OUT = os.path.join(HERE, 'BigC FF Renovation 2027 + MTN Manual.pptx')
SHOTS = os.path.join(HERE, 'Manual_FFR_src', 'shots')
CFG = json.load(open(sys.argv[1], encoding='utf-8'))
CACHE = sys.argv[2]; os.makedirs(CACHE, exist_ok=True)

RED = RGBColor(0xE3, 0x1B, 0x23); GREEN = RGBColor(0x5C, 0x9E, 0x0B); LIME = RGBColor(0x96, 0xD5, 0x00)
INK = RGBColor(0x1F, 0x29, 0x37); MUTE = RGBColor(0x6B, 0x72, 0x80); WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LINE = RGBColor(0xD9, 0xDE, 0xE5); TINT = RGBColor(0xF3, 0xF8, 0xEA); PINK = RGBColor(0xFD, 0xEC, 0xEC)
OKC = RGBColor(0x04, 0x78, 0x57); WKC = RGBColor(0x03, 0x69, 0xA1); NEWC = RGBColor(0xDC, 0x26, 0x26); NONEC = RGBColor(0x47, 0x55, 0x69)
AMBER = RGBColor(0xB4, 0x53, 0x09); AMB_BG = RGBColor(0xFF, 0xFB, 0xEB)
FONT = 'Tahoma'

prs = Presentation(SRC)
L_COVER = prs.slides[0].slide_layout      # green-band title layout
L_BODY = prs.slides[1].slide_layout       # logo + rule + confidential footer


def font(run, sz, bold=False, color=INK, italic=False):
    f = run.font; f.size = Pt(sz); f.bold = bold; f.italic = italic; f.color.rgb = color; f.name = FONT
    rPr = run._r.get_or_add_rPr()
    for tag in ('a:cs', 'a:ea'):
        el = rPr.find(qn(tag))
        if el is None:
            el = rPr.makeelement(qn(tag), {}); rPr.append(el)
        el.set('typeface', FONT)


def text(slide, x, y, w, h, parts, sz=13, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         margin=0.04, space=4, name=None):
    """parts: str | list of paragraphs; paragraph = str | list of (text, {opts}) runs."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name: tb.name = name
    tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
    for m in ('margin_left', 'margin_right', 'margin_top', 'margin_bottom'):
        setattr(tf, m, Inches(margin))
    paras = parts if isinstance(parts, list) else [parts]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align; para.space_after = Pt(space)
        runs = p if isinstance(p, list) else [(p, {})]
        for t, o in runs:
            r = para.add_run(); r.text = t
            font(r, o.get('sz', sz), o.get('b', bold), o.get('c', color), o.get('i', False))
    return tb


def box(slide, x, y, w, h, fill, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06, name=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if name: s.name = name
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None: s.line.fill.background()
    else: s.line.color.rgb = line; s.line.width = Pt(0.75)
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE: s.adjustments[0] = radius
    s.text_frame.text = ''
    return s


def badge(slide, x, y, n, d=0.3, fill=RED, sz=11):
    c = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    c.fill.solid(); c.fill.fore_color.rgb = fill; c.line.fill.background(); c.shadow.inherit = False
    tf = c.text_frame
    for m in ('margin_left', 'margin_right', 'margin_top', 'margin_bottom'): setattr(tf, m, 0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER; r = p.add_run(); r.text = str(n); font(r, sz, True, WHITE)
    return c


PAGE = [0]


def body_slide(heading, kicker=None):
    s = prs.slides.add_slide(L_BODY)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    PAGE[0] += 1
    # same header position as Toey's slides (TextBox 13 at 1.41,0.15)
    text(s, 1.41, 0.2, 8.2, 0.7, [[('คู่มือ MTN Pre-check  ', {'sz': 13, 'c': GREEN, 'b': True}),
                                   ('· FF Renovation 2027', {'sz': 13, 'c': MUTE})], heading],
         sz=24, bold=True, margin=0, space=0, name='Heading')
    if kicker:
        text(s, 0.6, 1.05, 8.8, 0.4, kicker, sz=12.5, color=MUTE, margin=0, name='Kicker')
    text(s, 8.7, 6.95, 0.8, 0.3, f'M{PAGE[0]}', sz=11, color=MUTE, align=PP_ALIGN.RIGHT, margin=0, name='PageNo')
    return s


def pic(name, max_w=1600):
    src = os.path.join(SHOTS, name + '.png'); dst = os.path.join(CACHE, name + '.jpg')
    if not os.path.exists(dst):
        im = Image.open(src).convert('RGB')
        if im.width > max_w: im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        im.save(dst, 'JPEG', quality=88)
    return dst


def add_pic(slide, name, x, y, max_w, max_h, frame=True):
    path = pic(name); w, h = Image.open(path).size
    sc = min(max_w / w, max_h / h); pw, ph = w * sc, h * sc
    px = x + (max_w - pw) / 2
    if frame: box(slide, px - 0.06, y - 0.06, pw + 0.12, ph + 0.12, WHITE, LINE, radius=0.02, name='Frame')
    p = slide.shapes.add_picture(path, Inches(px), Inches(y), Inches(pw), Inches(ph))
    p.name = 'Screenshot ' + name
    return pw, ph


def callouts(slide, x, y, w, items, sz=12, gap=0.1, line_h=0.205, start=1):
    """numbered list beside a screenshot; items = list of str or list-of-runs. Rough height estimate per item."""
    cy = y
    for i, it in enumerate(items, start):
        badge(slide, x, cy + 0.02, i, d=0.27, sz=10)
        runs = it if isinstance(it, list) else [(it, {})]
        n_chars = sum(len(t) for t, _ in runs)
        lines = max(1, -(-n_chars // int(w * 9.2 * 12 / sz)))
        h = lines * line_h * sz / 12 + 0.06
        text(slide, x + 0.36, cy, w - 0.36, h, [runs], sz=sz, margin=0.02)
        cy += h + gap
    return cy


def table(slide, x, y, w, col_w, rows, sz=11, head_fill=RED, row_h=0.32, colors=None):
    shp = slide.shapes.add_table(len(rows), len(col_w), Inches(x), Inches(y), Inches(w), Inches(row_h * len(rows)))
    tbl = shp.table
    tblPr = tbl._tbl.tblPr
    st = tblPr.find(qn('a:tableStyleId'))
    if st is None:
        st = tblPr.makeelement(qn('a:tableStyleId'), {}); tblPr.append(st)
    st.text = '{5940675A-B579-460E-94D1-54222C63F5DA}'  # No Style, Table Grid
    for j, cw in enumerate(col_w): tbl.columns[j].width = Inches(cw)
    for i, row in enumerate(rows):
        tbl.rows[i].height = Inches(row_h)
        for j, val in enumerate(row):
            c = tbl.cell(i, j); c.margin_left = c.margin_right = Inches(0.06); c.margin_top = c.margin_bottom = Inches(0.03)
            c.vertical_anchor = MSO_ANCHOR.MIDDLE
            c.fill.solid(); c.fill.fore_color.rgb = head_fill if i == 0 else (WHITE if i % 2 else RGBColor(0xF8, 0xFA, 0xFC))
            tf = c.text_frame; tf.word_wrap = True; p = tf.paragraphs[0]
            r = p.add_run(); r.text = str(val)
            col = WHITE if i == 0 else (colors(i, j) if colors else INK) or INK
            font(r, sz, i == 0 or (colors is not None and colors(i, j) is not None), col)
    return shp


# ───────────────────────── M0 · divider ─────────────────────────
s = prs.slides.add_slide(L_COVER)
band = box(s, 0, 2.53, 10, 3.56, LIME, shape=MSO_SHAPE.RECTANGLE, name='Green band')
s.shapes._spTree.remove(band._element); s.shapes._spTree.insert(2, band._element)
t = s.shapes.title; t.left, t.top, t.width, t.height = Inches(0.5), Inches(2.53), Inches(9), Inches(3.56)
t.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
s.shapes.title.text = 'คู่มือสำรวจก่อน Renovate Fresh Food'
for p in s.shapes.title.text_frame.paragraphs:
    for r in p.runs: font(r, 32, True, INK)
sub = s.shapes.title.text_frame.add_paragraph(); r = sub.add_run()
r.text = 'MTN Pre-check · สำหรับ M1 / MTN สาขา / Area MTN'; font(r, 20, False, INK)
for ph in list(s.placeholders):
    if ph.placeholder_format.idx != 0: ph._element.getparent().remove(ph._element)

# ───────────────────────── M1 · objective ─────────────────────────
s = body_slide('วัตถุประสงค์ & สิ่งที่ MTN ต้องตรวจ')
box(s, 0.6, 1.1, 8.8, 0.95, TINT, name='Lesson')
text(s, 0.8, 1.15, 8.4, 0.85, [[('ก่อนปรับปรุงโซน Fresh Food ทีมโครงการต้องการ', {}), ('ข้อมูลจริงจากหน้างาน', {'b': True}),
     (' เพื่อสรุปว่าตู้แช่แต่ละใบควร ', {}), ('Refurbish', {'b': True, 'c': OKC}), (' / ', {}), ('ใช้ต่อ (Workable)', {'b': True, 'c': WKC}),
     (' / ', {}), ('ซื้อใหม่ (Request New)', {'b': True, 'c': NEWC}), (' และ Rack เดิมยังใช้ต่อได้หรือไม่', {})]],
     sz=14, anchor=MSO_ANCHOR.MIDDLE)
five = [('อุณหภูมิพื้นที่ขาย', 'ตู้ Plug-in / ตู้ Open ทำงานได้ดีเฉพาะเมื่อพื้นที่ขายไม่ร้อนเกิน'),
        ('ตู้แช่ทุกใบตามแผน', 'สรุปเป็น Refurbish / Workable / Request New'),
        ('Rack / Multiset / Cold room', 'สภาพ + รูปถ่าย'),
        ('ความพร้อมหน้างาน Remote / Plug-in', 'ไฟ · ท่อ · ห้องเครื่อง · จุดระบายน้ำ'),
        ('Final Layout', 'Layout ล่าสุดตรงกับหน้างานหรือไม่')]
y = 2.3
for i, (h, d) in enumerate(five, 1):
    badge(s, 0.7, y + 0.06, i, d=0.5, sz=18)
    text(s, 1.4, y, 7.9, 0.62, [[(h, {'b': True, 'sz': 15})], [(d, {'c': MUTE, 'sz': 13})]], margin=0, space=1)
    y += 0.72
box(s, 0.6, 6.0, 8.8, 0.62, AMB_BG, RGBColor(0xFD, 0xE6, 0x8A), name='Principle')
text(s, 0.8, 6.02, 8.4, 0.58, [[('หลักการ: ', {'b': True}), ('ตรวจตามสภาพจริง ไม่ประเมินเกินหรือขาด · ถ่ายรูปทุกการ์ด · ตู้ / Rack ที่จะรื้อออกต้องมี Asset No.', {})]],
     sz=13, anchor=MSO_ANCHOR.MIDDLE)

# ───────────────────────── M2 · 4 steps + schedule ─────────────────────────
s = body_slide('ภาพรวม 4 ขั้นตอน & กำหนดการ')
steps = [('เลือกสาขา', 'ระบบดึงแผนของสาขา + Final Layout และสร้างการ์ดตู้แช่ให้อัตโนมัติ'),
         ('วัดอุณหภูมิ', 'พื้นที่ขายอย่างน้อย 3 จุด + รูปเครื่องวัด'),
         ('ตรวจตู้ + Rack', 'แยกจำนวนทุกการ์ด · ประเมินสภาพ · Rack + Condenser พร้อมรูป'),
         ('หน้างาน → ส่ง', 'ตอบ 8 ข้อ Remote / Plug-in · แอร์/ไฟ · ข้อจำกัดติดตั้ง · Submit')]
cw = 2.05
for i, (h, d) in enumerate(steps):
    x = 0.6 + i * (cw + 0.2)
    box(s, x, 1.15, cw, 2.35, WHITE, LINE, name=f'Step {i+1}')
    badge(s, x + cw / 2 - 0.25, 1.3, i + 1, d=0.5, sz=18)
    text(s, x + 0.1, 1.9, cw - 0.2, 0.4, h, sz=15, bold=True, align=PP_ALIGN.CENTER)
    text(s, x + 0.12, 2.3, cw - 0.24, 1.15, d, sz=12, color=MUTE, align=PP_ALIGN.CENTER)
    if i < 3:
        a = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + cw + 0.03), Inches(2.2), Inches(0.14), Inches(0.25))
        a.fill.solid(); a.fill.fore_color.rgb = LIME; a.line.fill.background()
text(s, 0.6, 3.8, 8.8, 0.4, 'กำหนดการ', sz=16, bold=True, margin=0)
sched = [('17 พ.ย. 2026', 'สื่อสาร Area MTN / M1', False), ('18–21 พ.ย. 2026', 'ลงพื้นที่ตรวจ + Submit ในแอป', True),
         ('22 พ.ย. 2026', 'HO รวบรวมผล', False), ('23 พ.ย. 2026', 'รายงานเข้าที่ประชุม → ปรับ Final list', False)]
ln = s.shapes.add_connector(1, Inches(0.9), Inches(4.62), Inches(9.1), Inches(4.62)); ln.line.color.rgb = LINE; ln.line.width = Pt(2.5)
for i, (d, t, hi) in enumerate(sched):
    x = 0.6 + i * 2.25
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.95), Inches(4.47), Inches(0.3), Inches(0.3))
    dot.fill.solid(); dot.fill.fore_color.rgb = RED if hi else GREEN; dot.line.color.rgb = WHITE; dot.line.width = Pt(2)
    box(s, x, 4.95, 2.1, 1.45, PINK if hi else TINT, name=f'Date {i+1}')
    text(s, x + 0.08, 5.02, 1.94, 0.4, d, sz=14, bold=True, color=RED if hi else GREEN, align=PP_ALIGN.CENTER)
    text(s, x + 0.1, 5.45, 1.9, 0.9, t, sz=12.5, align=PP_ALIGN.CENTER, bold=hi)

# ───────────────────────── M3 · who / prepare ─────────────────────────
s = body_slide('ใครกรอก / ต้องเตรียมอะไร')
cards = [('👷 ผู้กรอก', ' · '.join(CFG['roles']) + ' — ถ้าเป็นผู้รับเหมาให้ใส่ชื่อบริษัทด้วย'),
         ('🧰 เตรียม', 'มือถือที่ล็อกอินแอป · เครื่องวัดอุณหภูมิ + ความชื้น · Final Layout ของสาขา (ดาวน์โหลดในข้อ 2) · ประวัติซ่อม CMS 12 เดือน (ถ้ามี) · ทะเบียนทรัพย์สินสาขา (FAS) สำหรับ Asset No.'),
         ('❄️ ข้อมูลแอร์ / ไฟฟ้า (ข้อ 6.2)', 'หน้าจอ Chiller หรือ BMS ช่วงบ่าย · Nameplate / As-built แอร์ · ขนาดหม้อแปลง · มิเตอร์ MDB หรือแคลมป์มิเตอร์ช่วงพีค — ไม่ทราบเว้นว่างได้ (บังคับเฉพาะชนิดระบบแอร์)'),
         ('🕐 เวลา', 'วัดอุณหภูมิช่วงบ่ายที่ร้อนที่สุด (≈ 13:00–16:00) · ใช้ ≈ 1.5–3 ชม. ต่อสาขา · กด Save Draft ระหว่างทาง แล้วทำต่อจากเครื่องอื่นได้')]
for i, (h, d) in enumerate(cards):
    x = 0.6 + (i % 2) * 4.5; y = 1.15 + (i // 2) * 2.75
    box(s, x, y, 4.3, 2.55, TINT if i % 3 == 0 else WHITE, None if i % 3 == 0 else LINE, name=f'Card {i+1}')
    text(s, x + 0.2, y + 0.15, 3.9, 0.4, h, sz=15, bold=True)
    text(s, x + 0.2, y + 0.6, 3.9, 1.85, d, sz=13)


# ───────────────────────── screenshot slides ─────────────────────────
def shot_slide(heading, img, items, kicker=None, foot=None, img_w=5.2, img_h=5.3, sz=12):
    s = body_slide(heading, kicker)
    top = 1.5 if kicker else 1.2
    add_pic(s, img, 0.6, top, img_w, img_h - (top - 1.2) - (0.6 if foot else 0))
    callouts(s, 0.6 + img_w + 0.25, top, 9.4 - (0.6 + img_w + 0.25), items, sz=sz)
    if foot:
        box(s, 0.6, 6.15, 8.8, 0.55, AMB_BG, RGBColor(0xFD, 0xE6, 0x8A), name='Note')
        text(s, 0.75, 6.17, 8.5, 0.51, foot, sz=12, anchor=MSO_ANCHOR.MIDDLE)
    return s


s = body_slide('4.0–4.1  อ่านแนวทาง → ผู้ตรวจ & สาขา (ข้อ 1)')
add_pic(s, 'f01_guide', 0.6, 1.2, 4.0, 1.4)
text(s, 0.6, 2.75, 4.0, 0.9, 'กล่องสีชมพูด้านบนฟอร์ม สรุปสิ่งที่ต้องทำทั้งหมดในหน้าเดียว — กดหัวข้อเพื่อย่อ / ขยาย อ่านก่อนลงพื้นที่',
     sz=12, color=MUTE)
add_pic(s, 'f02_store', 4.85, 1.2, 4.55, 3.15)
callouts(s, 0.6, 3.75, 4.05, ['ตำแหน่ง / หน่วยงาน (ผู้รับเหมาต้องใส่ชื่อบริษัท)', 'วันที่ตรวจจริง',
                              'พิมพ์รหัส Gold / Oracle หรือชื่อสาขา'], sz=12)
callouts(s, 4.85, 4.55, 4.55, ['แต่ละสาขาแสดง Model (S/M/L) · ทีม · ✓ ตรวจแล้ว วันที่',
                               'ซ่อนสาขาที่ตรวจแล้ว — เหลือเฉพาะที่ยังต้องไป'], sz=12, start=4)
box(s, 0.6, 5.9, 8.8, 0.75, AMB_BG, RGBColor(0xFD, 0xE6, 0x8A), name='Note')
text(s, 0.75, 5.92, 8.5, 0.71, [[('ช่องค้นหาแสดงเฉพาะสาขาในโครงการ', {'b': True}), (' — คลิกช่องโดยไม่ต้องพิมพ์เพื่อดูทั้งหมด · สาขาที่ขึ้นป้าย ', {}),
                                 ('🏗️ Full Renovate', {'b': True}), (' ยังต้องตรวจตามปกติ ข้อมูลใช้ประกอบการออกแบบ', {})]],
     sz=12, anchor=MSO_ANCHOR.MIDDLE)

shot_slide('4.2  แผนของสาขา & Final Layout (ข้อ 2)', 'f03_context_u',
           ['สรุปแผน: จำนวนตู้แผน Refurbish / แผนซื้อใหม่ · Plug-in / Remote',
            [('Final Layout', {'b': True}), (' ของสาขา — กด "เปิดดู" หรือ "ดาวน์โหลด" แล้วเดินเทียบหน้างาน', {})],
            'ลิงก์ทะเบียนทรัพย์สินสาขา (FAS) และหน้าขอตัดจำหน่ายตาม DOA ในแอป MNC — ใช้หา Asset No.',
            'สถานะ Final Layout (บังคับ) — "ไม่ตรงกับหน้างาน" ต้องระบุจุดที่ไม่ตรง + แนบรูป Layout ที่ขีดแก้'],
           kicker='หลังเลือกสาขา ระบบแสดงแผนของสาขา และสร้างการ์ดตู้แช่ให้ในข้อ 4 ทันที',
           foot='ตัวเลือกสถานะ: ' + ' / '.join(CFG['layoutSt']) + ' — ยังไม่มีไฟล์ก็ตรวจต่อได้ตามปกติ')

s = shot_slide('4.3  อุณหภูมิพื้นที่ขาย (ข้อ 3)', 'f04_amb',
               ['แต่ละแถว = 1 จุดวัด: โซน · °C · %RH · เวลา · หมายเหตุ — กด "+ เพิ่มจุดวัด" ได้',
                'ช่องเปลี่ยนสีอัตโนมัติ (ดูแถบด้านล่าง) — จุดที่ร้อนให้เขียนสาเหตุ เช่น ใกล้ประตู Loading',
                'สรุปค่าสูงสุด / เฉลี่ย (รายงานใช้ค่าสูงสุด)', 'รูปหน้าจอเครื่องวัดอย่างน้อย 1 รูป (บังคับ)'],
               kicker='วัดอย่างน้อย 3 จุด (Produce / Butchery / Frozen …) ช่วงบ่ายที่ร้อนที่สุด สูง 1.5 ม. ห่างตู้ ≥ 1 ม.',
               img_h=4.3)
ok, mx = CFG['ok'], CFG['max']
for i, (lbl, sub, fg, bg) in enumerate([(f'≤ {ok} °C', 'ผ่าน', OKC, RGBColor(0xEC, 0xFD, 0xF5)),
                                        (f'≤ {mx} °C', 'เฝ้าระวัง', AMBER, AMB_BG),
                                        (f'> {mx} °C', 'ร้อนเกิน', NEWC, PINK)]):
    x = 0.6 + i * 2.97
    box(s, x, 5.05, 2.85, 0.95, bg, name=f'Band {i+1}')
    text(s, x, 5.08, 2.85, 0.5, lbl, sz=20, bold=True, color=fg, align=PP_ALIGN.CENTER)
    text(s, x, 5.55, 2.85, 0.4, sub, sz=13, color=fg, align=PP_ALIGN.CENTER)
text(s, 0.6, 6.12, 8.8, 0.6, f'อ้างอิงตู้ Climate Class 3 = {ok} °C / {CFG["rh"]} %RH · เกณฑ์ "ร้อนเกิน > {mx} °C" เป็นฉบับร่าง รอยืนยันกับผู้ผลิตตู้ — สาขาที่ร้อนเกินควรระวังการเพิ่มตู้ Plug-in / ตู้ Open',
     sz=11, color=MUTE, margin=0)

shot_slide('4.4  ตู้แช่ตามแผน (ข้อ 4) — หัวใจของแบบสำรวจ', 'f05_card_ref_u',
           ['ป้ายแผนของการ์ดนี้ (เขียว = Refurbish · แดง = ซื้อใหม่)',
            'จำนวนที่ตรวจ (บังคับ) · ระบบ · ตำแหน่ง · ปีติดตั้ง · ยี่ห้อ · อุณหภูมิตู้ · ซ่อม CMS 12 เดือน',
            'สภาพ 3 ด้าน (บังคับ): ตัวตู้ · ระบบทำความเย็น · ประตู/กระจก/ไฟ — ดี / พอใช้ / แย่',
            [('ผลสรุป: Refurbish + Workable + Request New + ไม่พบ ', {}), ('ต้องรวมเท่ากับจำนวนที่ตรวจ', {'b': True}), (' (ขึ้น ✓)', {})],
            'มี Request New ในการ์ดแผน Refurbish → ต้องเลือกเหตุผล',
            'ตู้เดิมที่ต้องรื้อ — Asset No. (FAS) + ประเภทตัดจำหน่าย',
            'รูปตู้ (บังคับ): ภาพรวม + จุดเสียหาย + Nameplate'],
           kicker='1 การ์ด = 1 รายการในแผน · ตัวอย่าง: แผน Refurbish 6 ใบ → หน้างาน Refurbish ได้ 4 · Workable 1 · Request New 1',
           img_w=4.6, sz=11.5)

s = body_slide('4.4  ตัวอย่างการ์ดแผนซื้อใหม่ + แถบสรุป',
               'ตัวอย่าง: แผนซื้อใหม่ 20 ใบ — หน้างานพบว่า 2 ใบยังดี ใช้ต่อได้')
add_pic(s, 'f06_card_new_u', 0.6, 1.5, 4.6, 3.95)
callouts(s, 5.45, 1.5, 3.95, ['แผน: ซื้อใหม่ 20', 'Workable 2 + Request New 18 = 20 ✓',
                              'ตู้เดิม 18 ใบที่จะรื้อ → Write-off & ขายซาก — ไม่รู้ Asset No. เว้นว่างได้ แต่ต้องเลือกประเภทตัดจำหน่าย'], sz=12)
text(s, 5.45, 3.85, 3.95, 1.6, [[('ตู้ที่ไม่อยู่ในแผน', {'b': True}), (' แต่พบที่หน้างาน → กด "＋ เพิ่มตู้ที่พบ"', {})],
                                [('การ์ดหาย / เริ่มใหม่', {'b': True}), (' → กด "สร้างการ์ดจากแผนใหม่"', {})]], sz=12)
add_pic(s, 'f07_bar_u', 0.6, 5.75, 8.8, 0.45)
text(s, 0.6, 6.33, 8.8, 0.4, [[('แถบสรุปติดด้านบนจอ: จำนวนตู้ทั้งหมด · ผลแต่ละกลุ่ม · ', {}), ('ยังไม่สรุป ต้องเป็น 0 ก่อนส่ง', {'b': True, 'c': NEWC})]],
     sz=12, margin=0)

shot_slide('4.5  Rack / Multiset / Cold room (ข้อ 5)', 'f08_rack',
           ['ประเภท (บังคับ): Multiset Positive / Negative · CDU · Cold Room',
            'คอมเพรสเซอร์ทั้งหมด / ที่ทำงานปกติ',
            [('ข้อเสนอ MTN', {'b': True}), (' (บังคับ): ใช้ต่อได้ / Overhaul / เปลี่ยน Rack ใหม่', {})],
            'Asset No. (FAS) Rack / Condenser + ประเภทตัดจำหน่าย (ถ้าเสนอเปลี่ยน)',
            'รูป Rack ทั้งชุด + Nameplate + ตู้คอนโทรล (บังคับ)',
            'รูป Condenser ภาพรวม + Nameplate (บังคับ ยกเว้น Cold Room)',
            [('กำลังสำรอง', {'b': True}), (' HP/kW · วงจร/วาล์วว่าง · รองรับตู้ Remote ใหม่ได้หรือไม่', {})]],
           kicker='1 การ์ด = 1 ชุด — ถ้าแผนมีติดตั้ง Multiset ใหม่ ระบบจะเตือนให้ยืนยันว่าจำเป็นต้องเปลี่ยนจริง',
           img_w=4.4, sz=11.5)

shot_slide('4.6  ความพร้อมหน้างาน — 6.1 ระบบรองรับ', 'f09_site',
           ['แตะเลือกคำตอบแต่ละข้อ (รายละเอียดหน้า Remote / Plug-in)',
            'คำตอบที่เป็นความเสี่ยงเป็นสีแดง และนับเป็น "ข้อเสี่ยง"',
            'ระยะเดินท่อโดยประมาณ ห้องเครื่อง → ตู้ไกลสุด (เมตร)',
            [('ข้อเสนอระบบของ MTN', {'b': True}), (' (บังคับ)', {})]],
           kicker='ตอบให้ครบทั้ง 8 ข้อ (บังคับ) — ใช้แบ่งสาขาเป็น "Remote + Plug-in" หรือ "Plug-in ทั้งหมด"', img_w=5.4)

s = body_slide('6.2 กำลังแอร์ & ไฟฟ้า · 6.3 ข้อจำกัดการติดตั้ง')
add_pic(s, 'f11_cap', 0.6, 1.2, 5.3, 1.6)
callouts(s, 6.1, 1.15, 3.3, ['ชนิดระบบแอร์พื้นที่ขาย (บังคับ)', 'Chiller ทั้งหมด / ที่เดินช่วงบ่าย — เดินไม่ครบ = มี Chiller สำรอง',
                             'โหลดแอร์ช่วงบ่าย (%) จาก Chiller / BMS', 'Main Breaker MDB + กระแสพีค → ไฟ MDB เหลือ %',
                             '💡 คำแนะนำขึ้นอัตโนมัติ (ทีมออกแบบตัดสินขั้นสุดท้าย)'], sz=10.5, gap=0.06)
add_pic(s, 'f12_inst', 0.6, 4.3, 5.3, 1.95)
callouts(s, 6.1, 4.3, 3.3, ['6 คำถาม: ทางขนตู้ · Loading · ทำงานกลางคืน · พื้นที่พักตู้ · ปิดโซนชั่วคราว · ห้าง/อาคารเช่า',
                             'คำตอบสีแดง = ข้อจำกัด', 'หมายเหตุ เช่น ความกว้างประตูจริง · เวลาที่ห้างอนุญาต'], sz=10.5, gap=0.06)
text(s, 0.6, 3.68, 8.8, 0.45, [[('ตู้ Plug-in ปล่อยความร้อนเข้าพื้นที่ขายและใช้ไฟหน้างาน', {'b': True}),
                                (' — ใช้ตัดสินว่าแอร์เดิมรับได้ / ใช้ Chiller สำรอง / ต้องเพิ่มแอร์ · ติดตั้งโดยไม่ปิดขาย', {})]],
     sz=11, color=MUTE, margin=0)

shot_slide('4.7  อุปกรณ์ห้องเตรียม & ส่ง (ข้อ 7–8)', 'f10_submit',
           ['อุปกรณ์ห้องเตรียม (Hub & Spoke) — นับเฉพาะที่มี: ใช้ได้ / ต้องซ่อม / ขอใหม่',
            'สรุป / ข้อเสนอ MTN · มีตู้/Rack เสียที่กระทบการขายตอนนี้ ให้ตอบ "มี"',
            [('Save Draft', {'b': True}), (' — บันทึกขึ้นระบบ ทำต่อจากเครื่องอื่นได้ (เบอร์โทรเดียวกัน)', {})],
            [('Submit', {'b': True}), (' — ตรวจช่องบังคับก่อนส่ง (ช่องที่ขาดกระพริบกรอบแดง) แล้วอัปโหลดรูป + ส่งอีเมลสรุป', {})]],
           foot='อัปโหลดรูปไม่สำเร็จ (สัญญาณไม่ดี) ข้อมูลยังอยู่ในฟอร์ม — กด Submit ซ้ำได้ รูปที่ขึ้นแล้วจะไม่ส่งซ้ำ',
           img_w=4.6, sz=12)

# ───────────────────────── M · required-fields checklist ─────────────────────────
s = body_slide('เช็กลิสต์ช่องบังคับก่อน Submit')
req = [('ข้อ 1', 'ผู้ตรวจ · เบอร์ · ตำแหน่ง · วันที่ · สาขา'), ('ข้อ 2', 'สถานะ Final Layout'),
       ('ข้อ 3', 'อุณหภูมิ ≥ 3 จุด + รูปเครื่องวัด'),
       ('ข้อ 4 · ทุกการ์ดตู้', 'จำนวน · แยกจำนวนครบ · สภาพ 3 ด้าน · เหตุผล (ซื้อใหม่นอกแผน) · ประเภทตัดจำหน่าย (ถ้ามี Request New) · รูป'),
       ('ข้อ 5 · ทุกการ์ด Rack', 'ข้อเสนอ MTN · รูป Rack · รูป Condenser'),
       ('6.1', 'คำถามหน้างาน 8 ข้อ + ข้อเสนอระบบ'), ('6.2', 'ชนิดระบบแอร์'), ('6.3', 'ข้อจำกัดการติดตั้งครบ 6 ข้อ')]
y = 1.2
for i, (k, v) in enumerate(req):
    box(s, 0.6, y, 8.8, 0.6, TINT if i % 2 == 0 else WHITE, None if i % 2 == 0 else LINE, name=f'Req {i+1}')
    text(s, 0.75, y, 0.4, 0.6, '☑', sz=18, color=GREEN, anchor=MSO_ANCHOR.MIDDLE, margin=0)
    text(s, 1.2, y, 2.1, 0.6, k, sz=13, bold=True, anchor=MSO_ANCHOR.MIDDLE, margin=0)
    text(s, 3.3, y, 6.0, 0.6, v, sz=12.5, anchor=MSO_ANCHOR.MIDDLE, margin=0)
    y += 0.68

# ───────────────────────── M · split rules ─────────────────────────
s = body_slide('กติกาแยกจำนวน Refurbish · Workable · New')
rules = [('🛠️ Refurbish ได้', 'ปรับปรุงแล้วใช้ต่อได้จริง (เปลี่ยนคอยล์ / ฉนวน / ประตู / ไฟ / ทำสี)', 'โครงสร้างแข็งแรง ทำอุณหภูมิได้ ขนาดตรง Layout ใหม่', OKC, RGBColor(0xEC, 0xFD, 0xF5)),
         ('✅ Workable', 'ใช้ต่อได้เลย ไม่ต้องทำอะไร', 'ตู้ค่อนข้างใหม่ สภาพดีทั้ง 3 ด้าน', WKC, RGBColor(0xE0, 0xF2, 0xFE)),
         ('🆕 Request New', 'ต้องซื้อใหม่ · ตู้เดิมรื้อออก → Write-off / ขายซาก', 'สนิมทะลุ คอยล์รั่ว อะไหล่เลิกผลิต ขนาดไม่ตรง Layout', NEWC, PINK),
         ('⛔ ไม่พบ', 'แผนระบุ แต่หน้างานไม่มีตู้นี้ (ย้าย / ถอดแล้ว / จุดติดตั้งใหม่)', 'ใส่หมายเหตุ', NONEC, RGBColor(0xF1, 0xF5, 0xF9))]
for i, (h, m, e, fg, bg) in enumerate(rules):
    x = 0.6 + i * 2.23
    box(s, x, 1.15, 2.1, 2.75, bg, name=f'Rule {i+1}')
    text(s, x + 0.1, 1.25, 1.9, 0.45, h, sz=14, bold=True, color=fg)
    text(s, x + 0.1, 1.72, 1.9, 1.1, m, sz=12)
    text(s, x + 0.1, 2.85, 1.9, 1.0, [[('เช่น ', {'b': True}), (e, {})]], sz=11, color=MUTE)
box(s, 0.6, 4.1, 4.3, 2.6, WHITE, LINE, name='Why')
text(s, 0.75, 4.18, 4.0, 0.4, 'เหตุผลที่ต้องซื้อใหม่ / Refurbish ไม่ได้', sz=13.5, bold=True)
text(s, 0.75, 4.6, 2.0, 2.0, [w for w in CFG['why'][:5]], sz=11.5, space=3)
text(s, 2.8, 4.6, 2.0, 2.0, [w for w in CFG['why'][5:]], sz=11.5, space=3)
box(s, 5.1, 4.1, 4.3, 2.6, AMB_BG, RGBColor(0xFD, 0xE6, 0x8A), name='Tips')
text(s, 5.25, 4.18, 4.0, 0.4, 'เคล็ดลับ', sz=13.5, bold=True)
text(s, 5.25, 4.6, 4.0, 2.05, ['อย่าเลือก Request New เพราะ "แผนบอกให้ซื้อ" — ถ้าตู้ยังดี ให้เลือก Workable หรือ Refurbish',
                               'ตู้ซ่อมบ่อย ใส่จำนวนครั้ง / ค่าซ่อม — ช่วยยืนยันการซื้อใหม่',
                               'ใบที่เสียต่างจากใบอื่น เขียนในหมายเหตุ เช่น "ตู้ 3 ใน 8 คอยล์รั่ว"'], sz=11.5, space=5)

# ───────────────────────── M · rack criteria ─────────────────────────
s = body_slide('เกณฑ์ Rack / Multiset')
rr = [('ใช้ต่อได้', 'คอมเพรสเซอร์ทำงานครบ ไม่รั่ว ซ่อมไม่บ่อย มีกำลังพอรับตู้ตามแผน', OKC, RGBColor(0xEC, 0xFD, 0xF5)),
      ('Overhaul / ซ่อมใหญ่', 'โครงสร้างยังดี แต่ต้องเปลี่ยนคอมเพรสเซอร์ / พัดลม Condenser / ชุดคอนโทรล หรืออุดรั่วใหญ่', AMBER, AMB_BG),
      ('เปลี่ยน Rack ใหม่', 'อายุมาก (เช่น > 15 ปี) + ซ่อมบ่อย / ค่าซ่อมสูง / น้ำยาเลิกใช้ (R22, R404A) / กำลังไม่พอรับตู้ใหม่', NEWC, PINK)]
y = 1.2
for i, (h, d, fg, bg) in enumerate(rr):
    box(s, 0.6, y, 8.8, 0.95, bg, name=f'Rack rec {i+1}')
    text(s, 0.8, y, 2.4, 0.95, h, sz=15, bold=True, color=fg, anchor=MSO_ANCHOR.MIDDLE, margin=0)
    text(s, 3.2, y, 6.0, 0.95, d, sz=13, anchor=MSO_ANCHOR.MIDDLE, margin=0)
    y += 1.07
box(s, 0.6, 4.5, 4.3, 2.2, WHITE, LINE, name='Types')
text(s, 0.75, 4.58, 4.0, 0.4, 'ประเภทที่เลือกได้', sz=13.5, bold=True)
text(s, 0.75, 5.0, 4.0, 1.65, CFG['rackTypes'], sz=12, space=3)
box(s, 5.1, 4.5, 4.3, 2.2, TINT, name='Data')
text(s, 5.25, 4.58, 4.0, 0.4, 'ข้อมูลที่ทีมออกแบบใช้ตัดสินใจ', sz=13.5, bold=True)
text(s, 5.25, 5.0, 4.0, 1.65, ['อายุ + ชนิดน้ำยา · คอมเพรสเซอร์ทำงาน / ทั้งหมด', 'คราบน้ำมัน / รั่ว · สภาพ Condenser',
                               'ซ่อม CMS 12 เดือน + ค่าซ่อม · กำลังสำรองรับตู้เพิ่ม', 'รูป Rack + Nameplate + Condenser'], sz=12, space=3)
text(s, 0.6, 6.78, 7.9, 0.2, 'เกณฑ์เป็นแนวทางให้ MTN — การตัดสินใจเปลี่ยน Rack ขั้นสุดท้ายเป็นของทีมออกแบบ / จัดซื้อ', sz=10, color=MUTE, margin=0)

# ───────────────────────── M · remote / plug-in ─────────────────────────
s = body_slide('Remote หรือ Plug-in — ความพร้อมหน้างาน (6.1)')
text(s, 0.6, 1.08, 8.8, 0.5, [[('หลักการ: ', {'b': True}), ('ตู้กลางฟลอร์ / ตู้เกาะ = ', {}), ('Plug-in', {'b': True}),
                               (' · ตู้ริมผนัง Upright ที่ระบบเดิมรองรับ = ', {}), ('Remote', {'b': True}),
                               (' · Plug-in ปล่อยความร้อนเข้าพื้นที่ขาย ต้องดูอุณหภูมิ + แอร์ประกอบกัน', {})]], sz=12, margin=0)
rows = [['#', 'คำถาม', 'ตัวเลือก', 'นับเป็นความเสี่ยง']] + [[str(i + 1), c['l'], ' / '.join(c['v']), ', '.join(c['bad']) or '— (ข้อมูลประกอบ)']
                                                       for i, c in enumerate(CFG['site'])]
table(s, 0.6, 1.65, 8.8, [0.35, 3.45, 3.1, 1.9], rows, sz=10, row_h=0.43,
      colors=lambda i, j: NEWC if (j == 3 and CFG['site'][i - 1]['bad']) else (MUTE if j == 3 else None))
text(s, 0.6, 5.75, 8.8, 0.3, 'ข้อเสนอระบบของ MTN (เลือก 1)', sz=12.5, bold=True, margin=0)
for i, t in enumerate(CFG['sysRec']):
    x = 0.6 + i * 2.23
    box(s, x, 6.1, 2.1, 0.62, TINT, name=f'Sys {i+1}')
    text(s, x + 0.05, 6.1, 2.0, 0.62, t, sz=10.5, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, margin=0.02)

# ───────────────────────── M · install constraints ─────────────────────────
s = body_slide('ข้อจำกัดการติดตั้ง (6.3) — ต้องติดตั้งโดยไม่ปิดขาย')
rows = [['#', 'คำถาม', 'ตัวเลือก', 'นับเป็นข้อจำกัด']] + [[str(i + 1), c['l'], ' / '.join(c['v']), ', '.join(c['bad']) or '— (ข้อมูลประกอบ)']
                                                     for i, c in enumerate(CFG['install'])]
table(s, 0.6, 1.2, 8.8, [0.35, 3.45, 3.1, 1.9], rows, sz=11, row_h=0.55,
      colors=lambda i, j: NEWC if (j == 3 and CFG['install'][i - 1]['bad']) else (MUTE if j == 3 else None))
box(s, 0.6, 5.3, 8.8, 1.35, TINT, name='Why install')
text(s, 0.8, 5.35, 8.4, 1.25, [[('ใช้ทำอะไร: ', {'b': True}), ('วางแผนการขนตู้และเวลาทำงานของผู้รับเหมา · คำตอบสีแดงนับเป็น "ติดตั้ง N ข้อ" ในรายงาน', {})],
                               [('หมายเหตุที่ควรใส่: ', {'b': True}), ('ความกว้างประตูจริง · เวลาที่ห้างอนุญาตให้ทำงาน', {})]],
     sz=13, anchor=MSO_ANCHOR.MIDDLE, space=6)

# ───────────────────────── M · write-off ─────────────────────────
s = body_slide('Write-off & ขายซาก')
box(s, 0.6, 1.15, 8.8, 0.85, PINK, name='Lead')
text(s, 0.8, 1.15, 8.4, 0.85, [[('ตู้ที่ใส่ ', {}), ('Request New', {'b': True, 'c': NEWC}), (' และ Rack ที่เสนอ ', {}), ('เปลี่ยน', {'b': True, 'c': NEWC}),
                                (' = ของเดิมต้องรื้อออก — แบบสำรวจเก็บเฉพาะข้อมูลที่ต้องใช้ ', {}), ('การขอตัดจำหน่ายจริงทำในแอป MNC', {'b': True})]],
     sz=13.5, anchor=MSO_ANCHOR.MIDDLE)
wo = [('Asset No. (FAS)', 'ดูจากปุ่ม 📦 ทะเบียนทรัพย์สินสาขา (ข้อ 2 ของฟอร์ม) · หลายเลขคั่นด้วย , · ไม่ทราบให้เว้นว่าง'),
      ('ประเภทตัดจำหน่าย', 'บังคับเมื่อมี Request New: ' + ' / '.join(CFG['wo'])),
      ('รูปทุกใบ', 'ตู้ · Rack Multiset · Condenser Multiset — ใช้ประกอบการตัดจำหน่ายและขายซาก')]
for i, (h, d) in enumerate(wo):
    x = 0.6 + i * 2.97
    box(s, x, 2.3, 2.85, 3.3, WHITE, LINE, name=f'WO {i+1}')
    badge(s, x + 0.2, 2.5, i + 1, d=0.55, sz=18)
    text(s, x + 0.2, 3.2, 2.45, 0.45, h, sz=15, bold=True)
    text(s, x + 0.2, 3.7, 2.45, 1.8, d, sz=12.5)
box(s, 0.6, 5.85, 8.8, 0.75, AMB_BG, RGBColor(0xFD, 0xE6, 0x8A), name='Note')
text(s, 0.8, 5.85, 8.4, 0.75, [[('ปุ่ม 📝 ขอตัดจำหน่ายตาม DOA', {'b': True}), (' เปิดหน้าขอ Write-off ในแอป MNC — ', {}), ('ไม่ต้องทำระหว่างสำรวจ', {'b': True})]],
     sz=13, anchor=MSO_ANCHOR.MIDDLE)

# ───────────────────────── M · FAQ ─────────────────────────
s = body_slide('คำถามที่พบบ่อย')
faq = [('แผนบอก 8 ใบ แต่หน้างานมี 6 ใบ?', 'ใส่จำนวนที่ตรวจ = 8 แยก 2 ใบเป็น "ไม่พบ" + หมายเหตุ — ถ้าต่างรุ่น ให้เพิ่มการ์ด "ตู้ที่พบ"'),
       ('ตู้เดียวกันแต่สภาพต่างกัน?', 'การ์ดเดียวแยกจำนวนได้ เช่น 6 = Refurbish 4 + Workable 1 + New 1 · เขียนใบที่แย่ในหมายเหตุ'),
       ('ไม่มีเครื่องวัดความชื้น?', 'ใส่เฉพาะ °C ได้ แต่ต้องวัด ≥ 3 จุด + รูปเครื่องวัด'),
       ('ไม่รู้ Asset No.?', 'เว้นว่างได้ — แต่ต้องเลือกประเภทตัดจำหน่าย + ถ่ายรูป Nameplate ไว้ HO จับคู่ภายหลัง'),
       ('สาขาไม่มี Rack (Plug-in ทั้งหมด)?', 'ไม่ต้องเพิ่มการ์ด Rack — ตอน Submit ระบบจะถามยืนยัน'),
       ('ส่งไปแล้ว อยากแก้ไข?', 'ส่งของสาขาเดิมใหม่ได้ — ใช้รายการล่าสุดเสมอ · รายการผิดแจ้ง Admin ลบ'),
       ('ไม่เห็นไฟล์ Final Layout?', 'เลือก "ยังไม่ได้รับ Final Layout" แล้วตรวจต่อ · แจ้ง HO วางไฟล์และกดสแกน')]
for i, (q, a) in enumerate(faq):
    col, row = (0, i) if i < 4 else (1, i - 4)
    x = 0.6 + col * 4.5; y = 1.15 + row * 1.4
    box(s, x, y, 4.3, 1.28, TINT if (i % 2 == 0) else WHITE, None if i % 2 == 0 else LINE, name=f'FAQ {i+1}')
    text(s, x + 0.15, y + 0.06, 4.0, 0.4, [[('Q  ', {'c': RED, 'b': True}), (q, {'b': True})]], sz=12.5)
    text(s, x + 0.15, y + 0.47, 4.0, 0.78, a, sz=11.5, color=INK)
box(s, 5.1, 5.35, 4.3, 1.08, RED, name='App')
text(s, 5.25, 5.35, 4.0, 1.08, [[('เปิดแอป → แท็บ 🥩 FF Renovate', {'b': True, 'c': WHITE, 'sz': 14})],
                                [('คู่มือออนไลน์ฉบับเต็มพร้อมภาพ: ?page=ffr-manual', {'c': WHITE, 'sz': 11.5})]],
     anchor=MSO_ANCHOR.MIDDLE, space=2)

prs.save(OUT)
print('saved', OUT, 'slides:', len(prs.slides))
