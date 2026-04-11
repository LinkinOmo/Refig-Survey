import os
import glob
import chardet

def fix_mojibake(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if this file has the specific mojibake signature.
    # 'เธ' is a very common sequence in UTF-8 Thai decoded as CP874.
    if 'เธ' not in content and 'เน' not in content:
        return False

    try:
        # The characters are currently UTF-8 code points representing CP874 characters.
        # Encode back to CP874 bytes...
        raw_bytes = content.encode('cp874')
        # ...then decode as UTF-8
        fixed_content = raw_bytes.decode('utf-8')
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        print(f"Fixed: {file_path}")
        return True
    except Exception as e:
        print(f"Could not fix {file_path}: {e}")
        return False

affected_files = 0
for ext in ['*.html', '*.gs']:
    for file_path in glob.glob(ext):
        if fix_mojibake(file_path):
            affected_files += 1

print(f"Total files fixed: {affected_files}")
