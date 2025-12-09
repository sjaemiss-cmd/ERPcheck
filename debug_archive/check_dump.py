
try:
    content = ""
    try:
        with open('calendar_dump.html', 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        with open('calendar_dump.html', 'r', encoding='latin-1') as f:
            content = f.read()
            
    if 'id="calendar"' in content:
        print("Found id=\"calendar\"")
    elif "id='calendar'" in content:
        print("Found id='calendar'")
    else:
        print("Not found id=calendar")
        
    if "fullCalendar" in content:
        print("Found fullCalendar script usage")
except Exception as e:
    print(e)
