
try:
    with open('debug.log', 'rb') as f:
        # Seek to end - 5000
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - 5000))
        content = f.read().decode('utf-8', errors='ignore')
        print(content)
except Exception as e:
    print(f"Error reading log: {e}")
