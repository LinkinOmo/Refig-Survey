import glob
import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

# We look for a few exact matches in the file to build our replacement dictionary dynamically!
# 'รายเธย\x87าเธย™' -> 'รายงาน'
# So 'เธย\x87' -> 'ง'
# 'เธย\x99' -> 'น'
# 'เธย\x9a' -> 'บ'   # 'อุเธยšัติ' -> 'อุบัติ'
# 'เธย\x84' -> 'ค'   # 'เธย„วาม' -> 'ความ'
# 'เธย\x9b' -> 'ป'   # 'เธย›ลอเธโ€ ' -> 'ปลอด'
# 'เธโ€ ' -> 'ด'
# 'เธย\xa0' -> 'ภ'   # 'เธย\xa0ัย' -> 'ภัย'
# 'เนโ‚ฌ' -> 'เ'      # 'เนโ‚ฌหตุ' -> 'เหตุ'

# Let's define the exact unicode sequences:
char_map = {
    '\u0E40\u0E18\u0E22\u0087': 'ง',           # เธย\x87
    '\u0E40\u0E18\u0E22\u0099': 'น',           # เธย\x99
    '\u0E40\u0E18\u0E22\u009A': 'บ',           # เธย\x9a
    '\u0E40\u0E18\u0E22\u0084': 'ค',           # เธย\x84
    '\u0E40\u0E18\u0E22\u009B': 'ป',           # เธย\x9b
    '\u0E40\u0E18\u0E42\u20AC ': 'ด',          # เธโ€  (wait, space is at the end? U+0E40 U+0E18 U+0E42 U+20AC U+0020)
    '\u0E40\u0E18\u0E22\u00A0': 'ภ',           # เธย\xa0
    '\u0E40\u0E19\u0E42\u201A\u0E0C': 'เ',     # เนโ‚ฌ
    '\u0E40\u0E18\u0E42\u201C\u0E4C': 'ณ์',     # เธโ€œเนยŒ -> 'ณ' and '์'. Let's just fix the whole thing: โ€œ is U+201C.
    '\u0E40\u0E18\u0E22\u008A': 'ช',           # เธยŠ
    '\u0E40\u0E18\u0E22\u0153': 'ผ',           # เธยœ -> 0x9C is 'œ' (U+0153)
    '\u0E40\u0E19\u0E49': '้',                  # เนย‰
    '\u0E40\u0E18\u0E16\u0E40\u0E19\u0E49': 'ึ้',  # เธถเนย‰
    '\u0E40\u0E19\u0E48': '่',                  # เนยˆ
    '\u0E40\u0E19\u0E47': '็',                  # เนย‡
    '\u0E40\u0E18\u0E42\u201D': 'ท',           # เธโ€”
    '\u0E40\u0E19\u0E46': 'ๆ',                  # เนย†
    '\u0E40\u0E18\u0E22\u02DC': 'ธ',           # เธย˜ -> 0x98 is '˜' (U+02DC)
    '\u0E40\u0E18\u0E22\u201A': 'ข',           # เธย‚ -> 0x82 is '‚' (U+201A)
    '\u0E40\u0E18\u0E42\u2013': 'ถ',           # เธโ€“ -> 0x96 is '–' (U+2013)
    '\u0E40\u0E19\u0E22': 'แ',                  # เนย 
    '\u0E40\u0E18\u0E42\u20AC\u0E02': 'ต',     # เธโ€ข -> 0x95 is '•'? No, 0x80 is '€', wait. 'ต' is 0x95!
    '\u0E40\u0E18\u0E22\u0081': 'ก',           # เธย\x81
}

text_orig = text
for k, v in char_map.items():
    text = text.replace(k, v)
    
if text != text_orig:
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Fixed index.html!")
else:
    print("No changes.")
