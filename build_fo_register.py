"""Build HyperFreshFoodRegister.gs from the FF inspection list.

Source: Web App People MNC/Hyper Survey/FF Attribute/FF Inspection_R3 .xlsx (sheet 'main machine')
Output: HyperFreshFoodRegister.gs — HYPER_FO_REGISTER { '<6-digit store code>': [[catId, sizeKey, qty, year, newPrice, repair5y, remark], ...] }
used by the Hyper Fresh Food tab to pre-fill cards ("📥 จากทะเบียน") and by its report to show the register values.

Re-import: replace the Excel, run `python build_fo_register.py`, then clasp push + deploy.
"""
import datetime
import json
import re
import sys

import openpyxl

SRC = r'G:/My Drive/00. Web Projects/Web App People MNC/Hyper Survey/FF Attribute/FF Inspection_R3 .xlsx'
OUT = r'G:/My Drive/00. Web Projects/Air_Ref_Servey/HyperFreshFoodRegister.gs'
STORES_GS = r'G:/My Drive/00. Web Projects/Air_Ref_Servey/HyperRefSurvey.gs'
FA_STORES_GS = r'G:/My Drive/00. Web Projects/Air_Ref_Servey/HyperFixedAssetStores.gs'

# (service type name, keyword in asset name or None) -> (category id, size key) — ids from HYPER_FO_CATEGORIES
MAP = [
    ('RACK OVEN', None, 'rackOven', 'U'),
    ('Deck Oven', None, 'deckOven', 'U'),
    ('Convention Oven', None, 'convOven', 'U'),
    ('ProoFer Machine', None, 'proofer', 'U'),
    ('Donut Fryer', None, 'donutFryer', 'U'),
    ('Hot Two Plate', None, 'cakeWarmer', 'U'),
    ('Dough Sheeter', None, 'doughSheeter', 'U'),
    ('Bread moulder', None, 'breadMoulder', 'U'),
    ('Hydraulic Divider', None, 'hydDivider', 'U'),
    ('Bun Divider', None, 'bunDivider', 'U'),
    ('Bread Slicer', None, 'breadSlicer', 'U'),
    ('Planetary Mixer', None, 'planetaryMixer', '5L'),
    ('Spiral Mixer 20L', None, 'spiralMixer', '20L'),
    ('Spiral Mixer 60L', None, 'spiralMixer', '60L'),
    ('Spiral Mixer 80L', None, 'spiralMixer', '80L'),
    ('Spiral Mixer 120L', None, 'spiralMixer', '120L'),
    ('Combi Oven', None, 'combiOven', 'U'),
    ('Fryer', 'Delica', 'fryer', 'DEL'),
    ('Fryer', 'Seafood', 'fryer', 'SEA'),
    ('Warmer Machine', 'ไก่', 'roaster', 'U'),
    ('Warmer Machine', 'แกง', 'curryWarmer', 'U'),
    ('Water Cooler', None, 'waterCooler', 'U'),
    ('Meat Chopper', None, 'meatChopper', 'U'),
    (None, 'เลื่อยกระดูก', 'boneSaw', 'U'),
    (None, 'สูญญากาศ', 'vacuumPacker', 'U'),
]


def map_row(svc, asset):
    svc = (svc or '').strip()
    asset = asset or ''
    for s, kw, cat, size in MAP:
        if s is not None and s.lower() != svc.lower():
            continue
        if s is None and svc:
            continue
        if kw and kw not in asset:
            continue
        return cat, size
    return None


def num(v):
    if v is None or isinstance(v, str) and not re.match(r'^\s*[\d,.]+\s*$', v):
        return ''
    try:
        n = float(str(v).replace(',', ''))
    except ValueError:
        return ''
    return int(round(n)) if n >= 0 else ''


# Wrong codes in the FF inspection file itself, checked against its Thai store names (keep in sync with
# HFO_REG_CODE_FIX in HyperFoRegisterAdmin.gs): 11255 holds both บ่อวิน (correct, FAD 11255) and อรัญประเทศ
# (FAD 11232) rows; 11113 พิษณุโลก's FAD branch code is not in the Hyper store list.
# (code, Thai-name fragment or '' for any) -> 6-digit code
CODE_FIX = [('11255', 'อรัญ', '111242'), ('11113', '', '110012')]


def resolve_code(c, hyper, gold, name=''):
    """Source store code -> 6-digit Hyper code. Same rule as _hfoRegCode_() in HyperFoRegisterAdmin.gs."""
    for fc, frag, to in CODE_FIX:
        if c == fc and frag in (name or ''):
            return to
    if c in hyper:
        return c
    if c in gold:
        return gold[c] if gold[c] in hyper else None
    return '1' + c if '1' + c in hyper else None   # only for codes that are not a gold code at all


def main():
    hyper = set(re.findall(r'\["(\d{6})"', open(STORES_GS, encoding='utf-8').read()))
    # 5-digit gold code -> 6-digit branch code from the FAD register. Never derive it as '1' + gold: the two
    # drift apart from ~11220 (gold 11230 Ban Phai = 111236, while 111230 is Kanchanaburi).
    fa = [json.loads(l.strip().rstrip(',')) for l in open(FA_STORES_GS, encoding='utf-8') if l.strip().startswith('["')]
    gold = {r[0]: r[1] for r in fa if r[1]}
    fa_th = {r[1]: r[3] for r in fa if r[1]}
    name_warn = set()
    ws = openpyxl.load_workbook(SRC, data_only=True)['main machine']
    hdr = [c.value for c in ws[1]]
    ix = {h: i for i, h in enumerate(hdr)}
    this_year = datetime.date.today().year
    reg, unmapped, unmatched = {}, {}, set()
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r[0] or r[ix['category name']] != 'FF equipment':
            continue
        src_code = str(r[0]).strip()
        code = resolve_code(src_code, hyper, gold, str(r[1] or ''))
        if code and r[1] and fa_th.get(code) and str(r[1]).replace(' ', '')[:3] not in fa_th[code].replace(' ', ''):
            name_warn.add((src_code, str(r[1]), code, fa_th[code]))
        if not code:
            unmatched.add(str(r[0]))
            continue
        m = map_row(r[ix['service type name']], r[ix['asset name']])
        if not m:
            k = (r[ix['service type name']], r[ix['asset name']])
            unmapped[k] = unmapped.get(k, 0) + 1
            continue
        q = r[ix['quantity']]
        qty = q if isinstance(q, int) else 0          # 'ไม่มี' / blank = the register says none
        y = r[ix['installation year']]
        y = y if isinstance(y, int) and 1970 <= y <= this_year + 1 else ''
        remark = str(r[ix['Remark']] or '').strip()[:80] if 'Remark' in ix else ''
        reg.setdefault(code, []).append([m[0], m[1], qty, y, num(r[ix['ราคาซื้อใหม่ (THB)']]), num(r[ix['มูลค่างานซ่อม 5 ปี (THB)2']]), remark])
    rows = sum(len(v) for v in reg.values())
    units = sum(x[2] for v in reg.values() for x in v)
    body = json.dumps(reg, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// --- Hyper Fresh Food equipment register (generated — do not edit by hand) ---\n')
        f.write('// Built by build_fo_register.py from "FF Inspection_R3 .xlsx" on %s: %d stores, %d rows, %d units.\n' % (datetime.date.today().isoformat(), len(reg), rows, units))
        f.write('// { storeCode: [[catId, sizeKey, qty, installYear, newPriceTHB, repair5yTHB, remark], ...] }\n')
        f.write("var HYPER_FO_REGISTER_SOURCE = 'FF Inspection_R3 (%s)';\n" % datetime.date.today().isoformat())
        f.write('var HYPER_FO_REGISTER = ' + body + ';\n')
    print('stores', len(reg), 'rows', rows, 'units', units, 'bytes', len(body))
    print('unmatched store codes (not in the Hyper store list):', sorted(unmatched))
    for w in sorted(name_warn):
        print('CHECK NAME: source %s "%s" -> %s "%s"' % w)
    if unmapped:
        print('UNMAPPED equipment rows:', unmapped)
        sys.exit(1)


if __name__ == '__main__':
    main()
