import json

NB_PATH = 'Refig_Survey_AnalysysR2_fill.ipynb'

with open(NB_PATH, encoding='utf-8') as f:
    nb = json.load(f)

cell = nb['cells'][30]
src = ''.join(cell['source'])

# ── Change 1: Add DD Name merge after oc BCM filter ──
OLD1 = (
    "oc = oc[oc['Store ID'].isin(bcm_ids11)].copy()\n"
    "oc[age_col] = pd.to_numeric(oc[age_col], errors='coerce')\n"
    "\n"
    "# คำนวณ Risk Key ถ้ายังไม่มี\n"
    "if rk_col not in oc.columns:"
)
NEW1 = (
    "oc = oc[oc['Store ID'].isin(bcm_ids11)].copy()\n"
    "oc[age_col] = pd.to_numeric(oc[age_col], errors='coerce')\n"
    "\n"
    "# Merge DD Name จาก master_active\n"
    "_dd_lu = master_active[['GOLD Code','DD Name (14)']].copy()\n"
    "_dd_lu['GOLD Code'] = _dd_lu['GOLD Code'].astype(str).str.strip()\n"
    "if 'DD Name (14)' not in oc.columns:\n"
    "    oc = oc.merge(_dd_lu.rename(columns={'GOLD Code':'_gkey'}),\n"
    "                  left_on='Store ID', right_on='_gkey', how='left').drop(columns=['_gkey'])\n"
    "\n"
    "# คำนวณ Risk Key ถ้ายังไม่มี\n"
    "if rk_col not in oc.columns:"
)

# ── Change 2: Section 5 — use DD Name (14) ────────────
OLD2 = (
    "# \u2500\u2500 5. Region (BCM CM Region) summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n"
    "reg_col = 'BCM CM Region'\n"
    "if reg_col not in oc.columns:\n"
    "    reg_col2 = [c for c in oc.columns if 'region' in c.lower() or 'cm' in c.lower()]\n"
    "    reg_col  = reg_col2[0] if reg_col2 else None"
)
NEW2 = (
    "# \u2500\u2500 5. DD Name summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n"
    "# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n"
    "reg_col = 'DD Name (14)'\n"
    "if reg_col not in oc.columns:\n"
    "    reg_col2 = [c for c in oc.columns if 'dd name' in c.lower()]\n"
    "    reg_col  = reg_col2[0] if reg_col2 else None"
)

# ── Change 3: Panel D title ────────────────────────────
OLD3 = "ax11d.set_title('D.  \u0e04\u0e48\u0e32\u0e40\u0e2a\u0e35\u0e22\u0e42\u0e2d\u0e01\u0e32\u0e2a\u0e41\u0e22\u0e01\u0e15\u0e32\u0e21 CM Region\\n(Top 10)', fontweight='bold', fontsize=11, color=DARK11)"
NEW3 = "ax11d.set_title('D.  \u0e04\u0e48\u0e32\u0e40\u0e2a\u0e35\u0e22\u0e42\u0e2d\u0e01\u0e32\u0e2a\u0e41\u0e22\u0e01\u0e15\u0e32\u0e21 DD Name\\n(Top 10)', fontweight='bold', fontsize=11, color=DARK11)"

# Apply changes
assert OLD1 in src, f"OLD1 not found!\n{repr(OLD1[:100])}"
assert OLD2 in src, f"OLD2 not found!\n{repr(OLD2[:100])}"
assert OLD3 in src, f"OLD3 not found!\n{repr(OLD3[:100])}"

src2 = src.replace(OLD1, NEW1, 1)
src2 = src2.replace(OLD2, NEW2, 1)
src2 = src2.replace(OLD3, NEW3, 1)

print('Changes applied. Verification:')
print('  Has _dd_lu:', '_dd_lu' in src2)
print('  Has DD Name reg_col:', "reg_col = 'DD Name (14)'" in src2)
print('  Has BCM CM Region:', 'BCM CM Region' in src2)
print('  Has DD title:', "DD Name\\n(Top 10)" in src2)

# Write back to JSON
lines = src2.split('\n')
new_source = [line + '\n' for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])
cell['source'] = new_source

with open(NB_PATH, 'w', encoding='utf-8') as f:
    json.dump(nb, f, ensure_ascii=False, indent=1)

print('Saved successfully!')

