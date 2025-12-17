
import os

file_path = 'mapping.csv'
if not os.path.exists(file_path):
    print("File not found")
    exit()

with open(file_path, 'rb') as f:
    raw_data = f.read(100) # Read first 100 bytes
    print(f"Raw bytes (hex): {raw_data.hex()}")

encodings = ['utf-8', 'euc-kr', 'cp949', 'utf-16', 'utf-16le']

for enc in encodings:
    try:
        with open(file_path, 'r', encoding=enc) as f:
            print(f"\n--- Trying {enc} ---")
            print(f.read())
            print("--- Success ---")
            break
    except UnicodeDecodeError:
        print(f"--- {enc} Failed ---")
    except Exception as e:
        print(f"--- {enc} Error: {e} ---")
