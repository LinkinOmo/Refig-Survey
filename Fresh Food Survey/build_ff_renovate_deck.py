"""Build FF_Renovation_MTN_PreCheck_2027.pptx — Big C design system (bigc-pptx skill).
Sources: Plaud meeting 15 Nov 2026, Notion 'ประชุม Freshfood Update' images, K.Dean LINE brief,
Toey's Master BOQ (Master_BOQ_FF Renovation 2027_Estimate Cost_MTN_R0.xlsx), FF Renovate Survey @580.
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn

NAVY   = RGBColor(0x1A, 0x23, 0x4A); ORANGE = RGBColor(0xF7, 0xA2, 0x1B); RED = RGBColor(0xBF, 0x28, 0x28)
GREEN  = RGBColor(0x1E, 0x8B, 0x4C); TEAL = RGBColor(0x17, 0x6B, 0x8C); WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LGRAY  = RGBColor(0xF4, 0xF4, 0xF4); MGRAY = RGBColor(0xBB, 0xBB, 0xBB); DGRAY = RGBColor(0x55, 0x55, 0x55)
NAVY2  = RGBColor(0x22, 0x30, 0x62); RED_LT = RGBColor(0xFF, 0xEB, 0xEB); ORG_LT = RGBColor(0xFF, 0xF3, 0xDA)
GRN_LT = RGBColor(0xE8, 0xF5, 0xEE); SKY = RGBColor(0x2B, 0x8F, 0xD6)

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = r"C:\Users\2455066\AppData\Local\Temp\claude\d8f16843161d391b\0bad26f7-725e-4ef8-b0cb-071651a866e4\scratchpad\notion"
APP = 'https://script.google.com/macros/s/AKfycbxgUC3d19UykuHyeQbv61Gc0P2HBcpLyf4T2p-jYEZ0ymFSSvU32U8kaRTHzXfemBYi/exec'

W, H = 13.333, 7.5
prs = Presentation(); prs.slide_width = Inches(W); prs.slide_height = Inches(H)
blank = prs.slide_layouts[6]
TOTAL = 12


def _font(r, sz, bold, color, italic=False):
    r.font.size = Pt(sz); r.font.bold = bold; r.font.italic = italic
    r.font.color.rgb = color; r.font.name = 'Calibri'
    rPr = r._r.get_or_add_rPr()
    for tag in ('a:cs', 'a:ea'):   # Thai glyphs: complex-script font
        el = rPr.find(qn(tag))
        if el is None:
            el = rPr.makeelement(qn(tag), {}); rPr.append(el)
        el.set('typeface', 'Leelawadee UI')


def box(sl, l, t, w, h, fill, lc=None, lw=Pt(0.75), shape=1):
    s = sl.shapes.add_shape(shape, Inches(l), Inches(t), Inches(w), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if lc: s.line.color.rgb = lc; s.line.width = lw
    else: s.line.fill.background()
    s.shadow.inherit = False
    return s


def tx(sl, l, t, w, h, text, sz=13, bold=False, color=NAVY, align=PP_ALIGN.LEFT, wrap=True, italic=False):
    tb = sl.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = wrap
    p = tf.paragraphs[0]; p.alignment = align
    r = p.add_run(); r.text = text; _font(r, sz, bold, color, italic)
    return tb


def mtx(sl, l, t, w, h, lines, wrap=True):
    tb = sl.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = wrap
    for i, item in enumerate(lines):
        text = item[0]; sz = item[1] if len(item) > 1 else 13; bold = item[2] if len(item) > 2 else False
        col = item[3] if len(item) > 3 else NAVY; aln = item[4] if len(item) > 4 else PP_ALIGN.LEFT; sp = item[5] if len(item) > 5 else 0
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = aln
        if sp: p.space_before = Pt(sp)
        r = p.add_run(); r.text = text; _font(r, sz, bold, col)
    return tb


def hdr(sl, title, sub=None):
    box(sl, 0, 0, W, 1.05, NAVY); box(sl, 0, 0, 0.13, 1.05, ORANGE)
    tx(sl, 0.28, 0.09, W - 3.7, 0.52, title, sz=21, bold=True, color=WHITE)
    if sub: tx(sl, 0.28, 0.62, W - 3.7, 0.36, sub, sz=11, color=ORANGE)
    tx(sl, W - 3.6, 0.07, 3.45, 0.36, 'Building Management  |  AVP Maintenance', sz=9, color=MGRAY, align=PP_ALIGN.RIGHT)


def ftr(sl, n, label='FF Renovation 2027  |  MTN Pre-check  |  Confidential — Internal Use Only'):
    box(sl, 0, H - 0.32, W, 0.32, NAVY)
    tx(sl, 0.2, H - 0.30, 9, 0.27, label, sz=8, color=MGRAY)
    tx(sl, W - 1.45, H - 0.30, 1.3, 0.27, f'{n} / {TOTAL}', sz=8, color=MGRAY, align=PP_ALIGN.RIGHT)


def kpi_card(sl, l, t, w, h, top, num, bottom, fill):
    box(sl, l, t, w, h, fill)
    tx(sl, l + 0.12, t + 0.08, w - 0.24, 0.3, top, sz=9, color=WHITE)
    tx(sl, l + 0.12, t + 0.33, w - 0.24, 0.5, num, sz=22, bold=True, color=WHITE)
    tx(sl, l + 0.12, t + 0.82, w - 0.24, 0.3, bottom, sz=9, color=WHITE)


def card(sl, l, t, w, h, accent, title, body, sz=10):
    box(sl, l, t, w, h, WHITE, lc=MGRAY, lw=Pt(0.5)); box(sl, l, t, w, 0.13, accent)
    tx(sl, l + 0.15, t + 0.2, w - 0.3, 0.38, title, sz=11, bold=True, color=accent)
    mtx(sl, l + 0.15, t + 0.6, w - 0.3, h - 0.7, [(b if isinstance(b, tuple) else (b, sz, False, DGRAY)) for b in body])


def pic(sl, path, l, t, w=None, h=None):
    if os.path.exists(path):
        return sl.shapes.add_picture(path, Inches(l), Inches(t), Inches(w) if w else None, Inches(h) if h else None)


# ─── 1. Cover ────────────────────────────────────────────────────────────
s = prs.slides.add_slide(blank)
box(s, 0, 0, W, H, NAVY); box(s, 0, 0, 0.28, H, ORANGE); box(s, 0.28, 3.05, W - 0.28, 0.04, ORANGE)
tx(s, 0.7, 0.45, 9, 0.4, 'BUILDING MANAGEMENT DEPARTMENT  |  AVP MAINTENANCE', sz=11, bold=True, color=ORANGE)
mtx(s, 0.7, 1.0, 11.5, 2.0, [('Fresh Food Renovation 2027', 38, True, WHITE),
                             ('MTN Pre-check Plan & Survey Module', 22, False, ORANGE, PP_ALIGN.LEFT, 4),
                             ('Refurbish · Workable · Request New  —  get the real numbers before the final BOQ', 16, False, MGRAY, PP_ALIGN.LEFT, 6)])
box(s, 0.7, 3.4, 5.6, 1.25, NAVY2)
mtx(s, 0.9, 3.5, 5.3, 1.1, [('Presented to', 10, False, MGRAY), ('K.Metin · K.Ake · K.Toey · K.Dean', 16, True, WHITE, PP_ALIGN.LEFT, 2),
                            ('Mon 16 Nov 2026  ·  by Barramee (Bar), AVP Maintenance', 11, False, ORANGE, PP_ALIGN.LEFT, 4)])
box(s, 6.6, 3.4, 6.0, 1.25, NAVY2)
mtx(s, 6.8, 3.5, 5.7, 1.1, [('Sources', 10, False, MGRAY), ('FF meeting 15 Nov (Plaud) · K.Dean LINE brief · Toey Master BOQ R0', 12, True, WHITE, PP_ALIGN.LEFT, 2),
                            ('Survey module live in the MTN app — tab "FF Renovate" (deploy @580)', 11, False, ORANGE, PP_ALIGN.LEFT, 4)])
for i, (a, b, c, f) in enumerate([('Stores in BOQ (FF Renovation)', '64', 'Hyper stores · 4 teams', TEAL),
                                  ('BOQ estimate (R0)', '฿546M', 'vs budget ฿486M', RED),
                                  ('Cabinets in BOQ', '4,057', '1,050 refurbish · 3,007 new', ORANGE),
                                  ('Site check window', '18–21 Nov', 'report 23 Nov', GREEN)]):
    kpi_card(s, 0.7 + i * 3.05, 5.15, 2.85, 1.25, a, b, c, f)
box(s, 0, H - 0.12, W, 0.12, ORANGE)

# ─── 2. Why MTN pre-check: budget gap ─────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Why a MTN pre-check — the budget gap', 'Limited money and time: no over-estimation, no under-estimation'); ftr(s, 2)
kpi_card(s, 0.4, 1.3, 3.0, 1.2, 'Approved budget', '฿486M', 'FF Upgrade / Renovation', GREEN)
kpi_card(s, 3.55, 1.3, 3.0, 1.2, 'BOQ estimate R0 (Toey)', '฿546M', 'Detail K.TOEY, 64 stores', RED)
kpi_card(s, 6.7, 1.3, 3.0, 1.2, 'Gap to close', '฿60–80M', 'target ≈ ฿500M (meeting)', ORANGE)
kpi_card(s, 9.85, 1.3, 3.05, 1.2, 'Delivery', 'Q1 2027', 'already told to suppliers', TEAL)
# cost breakdown bars
tx(s, 0.4, 2.75, 7, 0.35, 'Where the ฿546M sits (BOQ R0, ฿ million)', sz=12, bold=True, color=NAVY)
rows = [('Frozen cabinets (1,743 new · 452 refurb)', 101.6, TEAL), ('Butchery dumps / counters (742 new)', 105.2, TEAL),
        ('Multiset racks — 32 positive + 10 negative', 113.4, RED), ('Chilled perishable (228 new · 398 refurb)', 47.6, TEAL),
        ('Piping + cabinet cables', 45.3, RED), ('Produce (155 new · 180 refurb)', 40.4, TEAL), ('Cold rooms (184 + / 42 −)', 29.6, RED),
        ('Rental, partitions, 2-yr PM warranty', 49.7, MGRAY), ('Bakery · Delica · Seafood', 13.0, TEAL)]
mx = 120.0
for i, (lab, v, c) in enumerate(rows):
    y = 3.15 + i * 0.42
    tx(s, 0.4, y, 3.7, 0.36, lab, sz=10, color=DGRAY)
    box(s, 4.15, y + 0.06, 3.6, 0.24, LGRAY)
    box(s, 4.15, y + 0.06, 3.6 * v / mx, 0.24, c)
    tx(s, 4.2 + 3.6 * v / mx, y, 0.9, 0.36, f'{v:.1f}', sz=10, bold=True, color=NAVY)
card(s, 8.4, 2.75, 4.55, 4.2, ORANGE, 'What MTN can move (red bars = system side)', [
    ('• ฿158.7M is Multiset + piping/cable — only needed if the Rack must really be replaced → MTN Rack check with photos', 10, False, DGRAY),
    ('• 1,050 cabinets are planned as Refurbish (฿47.0M) — if they cannot really be refurbished the cost goes UP', 10, False, DGRAY, PP_ALIGN.LEFT, 5),
    ('• 3,007 new cabinets (฿260.9M) — any old cabinet still Workable is money saved', 10, False, DGRAY, PP_ALIGN.LEFT, 5),
    ('• Plug-in for mid-floor islands instead of Remote cuts piping, rack load and install time (meeting proposal)', 10, False, DGRAY, PP_ALIGN.LEFT, 5),
    ('Red = system / infrastructure (decided by Rack + Remote/Plug-in check)  ·  Teal = cabinets', 9, False, MGRAY, PP_ALIGN.LEFT, 8)])

# ─── 3. K.Dean brief ─────────────────────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, "K.Dean's brief — 5 steps to the final proposal", 'LINE, 15 Nov: "each task leader please perform with timeline"'); ftr(s, 3)
steps = [('1', 'Group of stores that fit "Remote" / "Plug-in" system', 'K.Ake + MTN', 'Survey section 6 → each store gets a system recommendation + site risks', TEAL),
         ('2', 'Guideline & checklist to M1 & Store MTN — all equipment incl. Hub & Spoke production plan', 'MTN (Bar · Ruj)', 'Checklist is built into the survey (guideline box + 8 sections + section 7 production equipment)', TEAL),
         ('3', 'Final layout + store walk; check all existing equipment → "Refurbish" / "Workable" / "Request new"', 'K.Ake · M1 & Store MTN · K.Dean', 'Layout PDF downloadable per store; every BOQ cabinet line becomes a card split into the 3 groups', ORANGE),
         ('4', 'K.Dean = centre to consolidate the final check from step 3', 'K.Dean (MTN)', 'Report page ?page=ffr_report — 64-store status, consolidated cabinet list, rack photo gallery, Excel export', ORANGE),
         ('5', 'Final proposal: final cost, BOQ, next step with procurement, execution plan with timeline', 'K.Toey · GCP · Procurement', 'Survey gives cost delta vs BOQ per store → Toey updates BOQ R1', NAVY)]
for i, (n, what, who, how, c) in enumerate(steps):
    y = 1.25 + i * 1.02
    box(s, 0.4, y, 0.75, 0.88, c); tx(s, 0.4, y + 0.14, 0.75, 0.6, n, sz=24, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    box(s, 1.15, y, 6.2, 0.88, LGRAY)
    mtx(s, 1.3, y + 0.06, 5.95, 0.8, [(what, 12, True, NAVY), ('Owner: ' + who, 10, False, c if c != NAVY else DGRAY, PP_ALIGN.LEFT, 3)])
    box(s, 7.45, y, 5.5, 0.88, GRN_LT, lc=GREEN, lw=Pt(0.5))
    mtx(s, 7.6, y + 0.06, 5.25, 0.8, [('How we answer it', 9, True, GREEN), (how, 10, False, DGRAY, PP_ALIGN.LEFT, 2)])
box(s, 0.4, 6.4, 12.55, 0.6, ORG_LT, lc=ORANGE)
tx(s, 0.55, 6.47, 12.3, 0.5, 'K.Dean also asked for a task-based Gantt — not only steps 1–5 but all key topics, who does what and when → slide 10', sz=11, bold=True, color=NAVY)

# ─── 4. What we heard (meeting 15 Nov) ───────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Meeting 15 Nov — what was agreed and what is still open', 'FF Upgrade: cabinet selection, Plug-in vs Remote, budget'); ftr(s, 4)
card(s, 0.4, 1.3, 4.05, 5.6, GREEN, 'Agreed in principle', [
    '• Plug-in for mid-floor / island cabinets (flexible re-layout, 4-side access)',
    '• Remote only for wall-side upright chill / frozen where the system supports it',
    '• Daytime-only mid-floor display → Plug-in (big remote unit + oil-return issue on long small pipes)',
    '• Dump cabinets: flexible spec — drain pipe where available, else 10–15 L tank',
    '• Final Store Layout must show existing / refurbish / new cabinets (team + SRD)',
    '• MTN checks 3 things: ambient temperature, cabinet condition, repair history (CMS)'], sz=12)
card(s, 4.65, 1.3, 4.05, 5.6, RED, 'Still open / to reconcile', [
    '• Store count: 68 · 64 · 61 · 52 + 8 full renovation — one master list needed (BOQ R0 = 64)',
    '• Cabinet totals by type / model / store, items 9 & 10 position (mid-floor vs wall)',
    '• Plug-in energy saving 12% / 17% — not confirmed (may be a Water-Loop report)',
    '• Waste-water handling, emptying & cleaning owner / frequency',
    '• Remote install risk: piping, power, dust & noise — stores cannot close',
    '• Budget ฿546M vs ฿486M'], sz=12)
card(s, 8.9, 1.3, 4.05, 5.6, ORANGE, "Toey's request to MTN (this week)", [
    ('Toey', 13, True, NAVY),
    ('• All-store summary + BOQ; slide with quantities and photos for Monday morning', 12, False, DGRAY),
    ('MTN', 13, True, NAVY, PP_ALIGN.LEFT, 8),
    ('• Check sales-floor temperature', 12, False, DGRAY),
    ('• Check the cabinets to be refurbished — can it really be done?', 12, False, DGRAY),
    ('• Rack photos so Toey can decide: replace the Rack or not', 12, False, DGRAY),
    ('Add-on (Bar)', 13, True, NAVY, PP_ALIGN.LEFT, 8),
    ('• Write-off prep: FAS asset data, partial write-off needs current NBV; scrap photos for GCP (Rack · Condenser · each cabinet)', 12, False, DGRAY)])

# ─── 5. Concept & layout reference ──────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Reference — FF concept S / M / L and layout mark-up', 'From the FF fixture deck and store layouts shared in the meeting'); ftr(s, 5)
pic(s, os.path.join(IMG, 'img1.png'), 0.4, 1.25, w=6.2)
pic(s, os.path.join(IMG, 'img3.png'), 6.75, 1.25, w=6.2)
pic(s, os.path.join(IMG, 'img7.png'), 6.75, 4.25, h=2.75)
box(s, 0.4, 5.0, 6.2, 2.0, LGRAY)
mtx(s, 0.55, 5.08, 5.95, 1.9, [('Concept per store model (BOQ R0: Model M 26 · L 23 · S 10 stores)', 11, True, NAVY),
                               ('• Butchery dump pork 8 / 10 / 12 · high chiller bay 3 / 4 / 5 (S/M/L)', 10, False, DGRAY, PP_ALIGN.LEFT, 3),
                               ('• Frozen bays 58 / 70 / 84 — butchery, seafood, processed food', 10, False, DGRAY),
                               ('• Layout mark-up: island cabinets removed / replaced, "old" vs "new" per position', 10, False, DGRAY),
                               ('→ MTN checks each "old" cabinet that the layout keeps or refurbishes', 10, True, ORANGE, PP_ALIGN.LEFT, 4)])

# ─── 6. Plug-in vs Remote ────────────────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Step 1 — Remote / Plug-in store grouping', 'Selection rule from the meeting + site conditions MTN confirms on site'); ftr(s, 6)
box(s, 0.4, 1.3, 6.2, 2.45, GRN_LT, lc=GREEN)
mtx(s, 0.55, 1.38, 5.9, 2.35, [('Plug-in  (BOQ: 2,781 cabinets · 483 refurb / 2,298 new)', 15, True, GREEN),
                               ('• Mid-floor / island, 4-side access, may move in re-layout', 13, False, DGRAY, PP_ALIGN.LEFT, 3),
                               ('• Daytime-only displays (no remote needed overnight)', 13, False, DGRAY),
                               ('• Needs: spare power at DB, floor outlets, drain or tank, AC that can absorb the heat', 13, False, DGRAY),
                               ('• Faster install, no piping, no rack load', 13, False, DGRAY)])
box(s, 6.75, 1.3, 6.2, 2.45, RGBColor(0xE6, 0xF0, 0xF6), lc=TEAL)
mtx(s, 6.9, 1.38, 5.9, 2.35, [('Remote  (BOQ: 1,276 cabinets · 567 refurb / 709 new)', 15, True, TEAL),
                              ('• Wall-side upright chill / frozen, 24-hour stores', 13, False, DGRAY, PP_ALIGN.LEFT, 3),
                              ('• Needs: machine-room space, pipe route, rack capacity', 13, False, DGRAY),
                              ('• Pipe class in BOQ: S ≤100 m · M ≤140 · L ≤160 · Extra ≤200 m', 13, False, DGRAY),
                              ('• Risk: piping time, dust & noise while the store stays open', 13, False, DGRAY)])
tx(s, 0.4, 3.95, 12, 0.35, 'Site conditions in the survey (section 6) — every store answers all 8, red answers become "site risks" in the report', sz=12, bold=True, color=NAVY)
conds = ['24-hour store', 'Machine-room / condenser space', 'Pipe route to remote cabinets', 'Spare power at MDB / DB',
         'Floor outlets for islands', 'Drain points (else tank 10–15 L)', 'AC can absorb plug-in heat', 'Night blinds on open cabinets']
for i, c in enumerate(conds):
    col, row = i % 4, i // 4
    box(s, 0.4 + col * 3.15, 4.4 + row * 0.62, 3.0, 0.52, LGRAY)
    tx(s, 0.5 + col * 3.15, 4.47 + row * 0.62, 2.85, 0.4, f'{i + 1}. {c}', sz=10, bold=True, color=NAVY)
box(s, 0.4, 5.75, 12.55, 1.25, NAVY2)
mtx(s, 0.6, 5.83, 12.2, 1.15, [('Starting point from the BOQ', 11, True, ORANGE),
                               ('Toey\'s BOQ lists 33 stores with a positive Multiset (Remote + Plug-in) and 28 "Plug-in only" stores; 14 stores appear in both lists and 17 in neither → MTN output: one recommendation per store — Remote + Plug-in / Plug-in all / keep existing remote / needs designer', 10, False, WHITE, PP_ALIGN.LEFT, 3)])

# ─── 7. Steps 2–3: the 3 MTN checks + write-off ──────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Steps 2–3 — what MTN checks at every store', 'Guideline & checklist for M1 / Store MTN · site visits 18–21 Nov'); ftr(s, 7)
card(s, 0.4, 1.3, 3.0, 4.3, TEAL, '1 · Sales-floor temperature', [
    '• ≥ 3 points: Produce, Butchery, Seafood, Frozen, Chilled …',
    '• Afternoon, 1.5 m high, ≥ 1 m from cabinets, °C + %RH',
    '• ≤ 25 °C OK · ≤ 27 °C watch · > 27 °C too hot (draft, cabinet class 3 = 25 °C / 60 %RH)',
    '• Photo of the meter'], sz=12)
card(s, 3.55, 1.3, 3.0, 4.3, ORANGE, '2 · Cabinets in the BOQ', [
    '• One card per BOQ line (planned refurbish / planned new)',
    '• Body · cooling · door/glass rating, install year, cabinet temp, CMS repairs 12 m',
    '• Split qty: Refurbish / Workable / Request New / not found',
    '• Reason required when refurbish is not possible',
    '• Photo of every card'], sz=12)
card(s, 6.7, 1.3, 3.0, 4.3, RED, '3 · Rack / Multiset / Cold room', [
    '• Type, brand, year, refrigerant (R22?), compressors working / total',
    '• Rack, condenser, leaks, controller, spare capacity',
    '• MTN advice: keep · overhaul · replace',
    '• Photos: rack + nameplate + controller, and condenser separately → Toey decides'], sz=12)
card(s, 9.85, 1.3, 3.1, 4.3, NAVY, '4 · Layout · Hub & Spoke · write-off', [
    '• Final layout: matches site / not / not received',
    '• Prep-room equipment: saw, grinder, slicer, vacuum, scale, ice maker…',
    '• Cabinets / racks leaving the store: FAS Asset No. + full / partial write-off',
    '• Links to MNC Store Assets (NBV) and Write-off by DOA'], sz=12)
box(s, 0.4, 5.8, 12.55, 1.2, ORG_LT, lc=ORANGE)
mtx(s, 0.55, 5.86, 12.3, 1.1, [('Why the write-off fields are already in the survey', 11, True, NAVY),
                               ('In practice write-off lands on store MTN. Partial write-off needs the current NBV from FAS; FAD may ask for it when the CAPEX account code per store is requested, and GCP needs data + photos to get scrap-price offers from suppliers. Taking the photos now saves a second visit.', 10, False, DGRAY, PP_ALIGN.LEFT, 3)])

# ─── 8. Survey module ────────────────────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Survey module — live in the MTN app (tab "FF Renovate")', 'Built from the meeting + BOQ; pre-filled per store so the visit takes minutes, not hours'); ftr(s, 8)
flow = [('Pick store', '64 BOQ stores; ✓ marks stores done', NAVY), ('BOQ + layout', 'plan per store, layout PDF download', TEAL),
        ('Ambient', '≥ 3 points + photo', TEAL), ('Cabinet cards', 'auto from BOQ, 3-way split + photo', ORANGE),
        ('Rack cards', 'condition + rack / condenser photos', RED), ('Site + submit', 'Remote/Plug-in, equipment, e-mail', GREEN)]
for i, (a, b, c) in enumerate(flow):
    x = 0.4 + i * 2.1
    box(s, x, 1.3, 1.9, 1.05, c)
    mtx(s, x + 0.08, 1.36, 1.75, 1.0, [(f'{i + 1}. {a}', 11, True, WHITE), (b, 9, False, WHITE, PP_ALIGN.LEFT, 3)])
    if i < 5: box(s, x + 1.9, 1.78, 0.2, 0.08, MGRAY)
card(s, 0.4, 2.6, 6.2, 4.4, TEAL, 'Form (for M1 / Store MTN, works on mobile)', [
    '• Guideline & checklist at the top of the form = step 2 of the brief',
    '• Store pick loads the BOQ: planned refurbish / new qty and ฿ per line',
    '• Layout files: PDFs in the Drive folder "Fresh Food Survey" are matched by store number (e.g. 112_Suratthani.pdf → 11112) and shown as Open / Download',
    '• Live counter: cabinets, Refurbish / Workable / New, cost change vs BOQ (฿)',
    '• Save Draft on device + server (continue on another phone)',
    '• All required fields checked on submit; photos required per card'], sz=12)
card(s, 6.75, 2.6, 6.2, 4.4, ORANGE, 'Report (?page=ffr_report) — for K.Dean / K.Toey', [
    '• KPI: stores done / 64, refurbish confirmed vs plan, workable / new, cost change, hot stores, racks to replace',
    '• Store table: team, model, layout, BOQ, ambient, 3-way result, rack advice, system recommendation, site risks',
    '• Consolidated cabinet list across stores = the final Refurbish / Workable / Request-new list',
    '• Rack gallery with photos, sorted by "replace" first',
    '• Excel export: Stores · Cabinets (incl. Asset No. & write-off type) · Racks',
    ('Link: ' + APP + '?page=ffr_report', 9, False, TEAL, PP_ALIGN.LEFT, 6)], sz=12)

# ─── 9. Decision logic / cost delta ──────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'How the result changes the BOQ', 'Each cabinet card = BOQ line × what MTN found → cost change per store (+ more money / − saving)'); ftr(s, 9)
hdrs = ['BOQ plan', 'MTN result', 'Meaning', 'Cost effect vs BOQ']
data = [('Refurbish', 'Refurbish OK', 'plan confirmed', '0'), ('Refurbish', 'Workable', 'fine as-is, no work needed', '− refurbish cost'),
        ('Refurbish', 'Request New', 'cannot be refurbished (reason required)', '+ (new − refurbish)'), ('New', 'Workable', 'old cabinet still good — keep it', '− new price'),
        ('New', 'Refurbish OK', 'refurbishing is enough', '− (new − refurbish)'), ('New', 'Request New', 'replace as planned → old one = write-off + scrap', '0'),
        ('Not in BOQ', 'Request New / Refurbish', 'found on site, missing from BOQ', '+ new / + refurbish')]
cw = [2.2, 2.6, 4.9, 2.85]
y = 1.35
x = 0.4
for j, hh in enumerate(hdrs):
    box(s, x, y, cw[j], 0.42, NAVY); tx(s, x + 0.08, y + 0.06, cw[j] - 0.1, 0.32, hh, sz=11, bold=True, color=WHITE); x += cw[j]
for i, r in enumerate(data):
    x = 0.4; y = 1.77 + i * 0.5
    fill = LGRAY if i % 2 == 0 else WHITE
    for j, v in enumerate(r):
        col = GREEN if v.startswith('−') else RED if v.startswith('+') else DGRAY
        box(s, x, y, cw[j], 0.5, fill)
        tx(s, x + 0.08, y + 0.1, cw[j] - 0.1, 0.35, v, sz=11, bold=(j == 3), color=col if j == 3 else (NAVY if j < 2 else DGRAY)); x += cw[j]
box(s, 0.4, 5.45, 6.2, 1.55, GRN_LT, lc=GREEN)
mtx(s, 0.55, 5.52, 5.95, 1.45, [('Example (built-in test, Suratthani 11112)', 11, True, GREEN),
                                ('Open High Chill L2500: BOQ refurbish 2 → MTN finds 1 refurbish + 1 request new → +฿60,000 vs BOQ (new ฿120k − refurbish ฿60k)', 10, False, DGRAY, PP_ALIGN.LEFT, 3)])
box(s, 6.75, 5.45, 6.2, 1.55, ORG_LT, lc=ORANGE)
mtx(s, 6.9, 5.52, 5.95, 1.45, [('Prices come from the BOQ', 11, True, ORANGE),
                               ('Refurbish / new ฿ per unit are Toey\'s BOQ R0 prices per cabinet type. When Toey issues R1 we re-run the import and the survey picks up the new list and prices.', 10, False, DGRAY, PP_ALIGN.LEFT, 3)])

# ─── 10. Gantt ───────────────────────────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Task-based Gantt — who does what, when', "K.Dean: all key topics, not only steps 1–5"); ftr(s, 10)
cols = ['16 Mon', '17 Tue', '18–21', '22 Sun', '23 Mon', '24–30', 'Dec', 'Jan 27', 'Feb 27', 'Mar 27']
x0, task_w, own_w = 0.4, 4.15, 2.2
cwid = (W - 0.4 - x0 - task_w - own_w) / len(cols)
y0 = 1.2
box(s, x0, y0, task_w, 0.4, NAVY); tx(s, x0 + 0.08, y0 + 0.06, task_w, 0.3, 'Task', sz=10, bold=True, color=WHITE)
box(s, x0 + task_w, y0, own_w, 0.4, NAVY); tx(s, x0 + task_w + 0.08, y0 + 0.06, own_w, 0.3, 'Owner', sz=10, bold=True, color=WHITE)
for j, c in enumerate(cols):
    xx = x0 + task_w + own_w + j * cwid
    box(s, xx, y0, cwid - 0.02, 0.4, NAVY2 if j < 6 else NAVY)
    tx(s, xx, y0 + 0.07, cwid, 0.3, c, sz=9, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
tasks = [
    ('All-store summary + BOQ, slide qty & photos', 'K.Toey', 0, 0, NAVY, ''),
    ('Review checklist / survey with K.Ake, K.Metin (13:00)', 'Bar · Ruj', 0, 0, TEAL, '#2'),
    ('Draft Remote / Plug-in store groups', 'K.Ake + MTN', 0, 1, TEAL, '#1'),
    ('Brief Area MTN; send guideline + survey link to M1 & Store MTN', 'Bar · Ruj', 1, 1, TEAL, '#2'),
    ('Final layouts into Drive folder (auto-shown in survey)', 'K.Toey · SRD', 0, 1, NAVY, '#3'),
    ('Store walk & survey, 64 stores (cabinets, rack, ambient, photos)', 'M1 · Store / Area MTN', 2, 2, ORANGE, '#3'),
    ('Consolidate final check (report page)', 'K.Dean (centre) · Bar', 3, 3, ORANGE, '#4'),
    ('Present final 3-group list + store groups', 'K.Dean · MTN', 4, 4, RED, '#1 #4'),
    ('Final cost & BOQ R1', 'K.Toey · GCP', 5, 5, NAVY, '#5'),
    ('Spec / TOR Plug-in & Remote, drain, PM warranty', 'MTN · K.Pop · K.Metin', 5, 6, TEAL, '#5'),
    ('Quotation / tender (owner side vs BJC Trading)', 'GCP · K.Sid · K.Nok', 6, 6, NAVY, '#5'),
    ('Write-off case (FAS NBV, DOA) + scrap offers', 'Store MTN · FAD · GCP', 6, 7, RED, ''),
    ('Install by store wave (stores stay open)', 'Contractor · Area MTN', 7, 9, GREEN, '#5'),
]
rh = 0.405
for i, (t, o, a, b, c, ref) in enumerate(tasks):
    y = y0 + 0.45 + i * rh
    fill = LGRAY if i % 2 == 0 else WHITE
    box(s, x0, y, task_w + own_w + len(cols) * cwid, rh, fill)
    tx(s, x0 + 0.06, y + 0.06, task_w - 0.1, 0.32, (ref + '  ' if ref else '') + t, sz=9, bold=bool(ref), color=NAVY)
    tx(s, x0 + task_w + 0.06, y + 0.06, own_w - 0.1, 0.32, o, sz=9, color=DGRAY)
    xa = x0 + task_w + own_w + a * cwid + 0.04
    box(s, xa, y + 0.08, (b - a + 1) * cwid - 0.1, rh - 0.16, c)
tx(s, x0, H - 0.68, 12.5, 0.3, '#n = step in K.Dean\'s brief  ·  dates 16–23 Nov from the 15 Nov meeting; Dec–Mar = Q1 delivery target, to be fixed with procurement', sz=9, italic=True, color=DGRAY)

# ─── 11. Risks ───────────────────────────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Risks & how the plan covers them', 'What could still break the Q1 delivery or the budget'); ftr(s, 11)
risks = [('One master store list', '68 / 64 / 61 / 52 / 8 still circulate', 'Survey uses BOQ R0 (64). Confirm the list Monday; R1 re-import adds or removes stores', RED),
         ('Refurbish not feasible', '1,050 cabinets assumed refurbishable', 'Each card needs a reason + photo for "Request New" → cost change visible per store', ORANGE),
         ('Rack replace by default', '42 Multisets = ฿113.4M', 'Rack card + photos + MTN advice; Toey decides per store with evidence', RED),
         ('Plug-in heat / power', 'Hot floors make plug-in cabinets struggle', 'Ambient check (> 27 °C flagged) + spare-power and AC questions', ORANGE),
         ('Remote installation', 'Piping, dust, noise; stores cannot close', 'Pipe route + machine-room questions; recommend plug-in where risky', TEAL),
         ('Write-off falls on stores', 'No NBV / photos when FAD or GCP ask', 'Asset No. + write-off type + scrap photos collected in the same visit', TEAL),
         ('Layout not final', 'Store walk without the final layout', 'Layout status is a required field; missing layouts shown in the report', NAVY)]
for i, (a, b, c, col) in enumerate(risks):
    y = 1.3 + i * 0.8
    box(s, 0.4, y, 0.12, 0.68, col)
    box(s, 0.52, y, 3.4, 0.68, LGRAY); tx(s, 0.62, y + 0.17, 3.2, 0.4, a, sz=12, bold=True, color=NAVY)
    box(s, 3.97, y, 3.6, 0.68, LGRAY); tx(s, 4.07, y + 0.12, 3.4, 0.5, b, sz=10, color=DGRAY)
    box(s, 7.62, y, 5.33, 0.68, GRN_LT); tx(s, 7.72, y + 0.12, 5.15, 0.5, c, sz=10, color=DGRAY)

# ─── 12. Decisions needed ────────────────────────────────────────────────
s = prs.slides.add_slide(blank); hdr(s, 'Decisions needed today (16 Nov)', 'So the site check can start on 18 Nov'); ftr(s, 12)
decs = [('1', 'Confirm the master store list for the site check (BOQ R0 = 64 FF Renovation stores)', 'K.Metin · K.Toey'),
        ('2', 'Approve the checklist / survey as the MTN guideline (sections 1–8)', 'K.Ake · K.Metin'),
        ('3', 'Ambient guideline: ≤ 25 °C OK / ≤ 27 °C watch / > 27 °C too hot — OK as draft?', 'K.Ake · supplier'),
        ('4', 'Final layouts: who uploads to the Drive folder by Tue 17 Nov (file name starts with store no.)', 'K.Toey · SRD'),
        ('5', 'Area MTN assignment for 18–21 Nov (12 Area staff; extra help from Small Format?)', 'K.Dean · Bar'),
        ('6', 'Write-off: FAD / GCP agree the fields we collect (Asset No., full / partial, photos)', 'FAD · GCP')]
for i, (n, d, who) in enumerate(decs):
    y = 1.3 + i * 0.78
    box(s, 0.4, y, 0.65, 0.65, ORANGE); tx(s, 0.4, y + 0.1, 0.65, 0.5, n, sz=20, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    box(s, 1.05, y, 9.0, 0.65, LGRAY); tx(s, 1.2, y + 0.15, 8.8, 0.45, d, sz=12, bold=True, color=NAVY)
    box(s, 10.1, y, 2.85, 0.65, NAVY2); tx(s, 10.2, y + 0.17, 2.7, 0.4, who, sz=11, color=WHITE, align=PP_ALIGN.CENTER)
box(s, 0.4, 6.1, 12.55, 0.9, NAVY)
mtx(s, 0.6, 6.15, 12.2, 0.85, [('Survey: MTN app → tab "FF Renovate"     ·     Report: ' + APP + '?page=ffr_report', 10, True, ORANGE),
                               ('Layout folder: Google Drive › Fresh Food Survey (16FuXy6exV_djOAlQeKtFSpvLmJTMNVnt) — drop PDFs named <store no>_<name>.pdf, then "⟳ สแกน Layout" in the report', 9, False, WHITE, PP_ALIGN.LEFT, 3)])

out = os.path.join(HERE, 'FF_Renovation_MTN_PreCheck_2027.pptx')
prs.save(out)
print('saved', out, len(prs.slides), 'slides')
