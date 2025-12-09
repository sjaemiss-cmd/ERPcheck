
try:
    content = ""
    try:
        with open('debug_wait_fail_dump.html', 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        with open('debug_wait_fail_dump.html', 'r', encoding='latin-1') as f:
            content = f.read()
            
    if 'Login' in content or '로그인' in content:
        print("Found Login/로그인 text")
    
    if '<iframe' in content:
        print("Found iframe")
        
    if 'id="calendar"' in content:
        print("Found id=calendar")
    else:
        print("Not found id=calendar")
        
    # Print Title
    import re
    title = re.search(r'<title>(.*?)</title>', content)
    if title:
        print(f"Title: {title.group(1)}")
        
except Exception as e:
    print(e)
