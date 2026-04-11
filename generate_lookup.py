import json

# Generate valid Thai characters
thai_chars = [chr(i) for i in range(0x0E01, 0x0E5C)]

mojibake_dict = {}

def get_mojibake(char):
    # original utf-8 bytes
    bytes_utf8 = char.encode('utf-8')
    
    # how did they get corrupted?
    # bytes_utf8 -> decoded as CP874 / CP1252
    corrupted_str = ''
    for b in bytes_utf8:
        # byte b
        # Let's say it was utf-8 Encoded AFTER being decoded as CP1252
        # BUT wait, the text was double encoded!
        # if b is 0xE0, it became 'เ'
        # if b is 0xB8, it became 'ธ'
        # if b is 0x94, it became '”' (U+201D)
        
        # simulated CP874 -> CP1252 decode
        try:
            c = bytes([b]).decode('cp874')
        except:
            try:
                c = bytes([b]).decode('cp1252')
            except:
                c = bytes([b]).decode('latin1')
                
        # Now c is a character. It was saved as UTF-8, then read as CP874
        c_bytes = c.encode('utf-8')
        c_final = ''
        for cb in c_bytes:
            try:
                c_final += bytes([cb]).decode('cp874')
            except:
                try:
                    c_final += bytes([cb]).decode('cp1252')
                except:
                    c_final += bytes([cb]).decode('latin1')
        
        corrupted_str += c_final
    return corrupted_str

for char in thai_chars:
    m = get_mojibake(char)
    # The stripping of \x9d or \x8f
    m = m.replace('\x9d', ' ').replace('\x8f', ' ')
    mojibake_dict[m] = char

with open('/tmp/thai_lookup.json', 'w', encoding='utf-8') as f:
    json.dump(mojibake_dict, f, ensure_ascii=False, indent=2)

print("Generated mapping for", len(mojibake_dict), "characters.")
