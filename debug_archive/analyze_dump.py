
import re

try:
    with open('calendar_real_dump.txt', 'r', encoding='utf-8') as f:
        content = f.read()
except:
    with open('calendar_real_dump.txt', 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

# Look for .fullCalendar({ ... })
fc_blocks = re.findall(r'\.fullCalendar\s*\(\s*\{.*?\n\s*\}\s*\)', content, re.DOTALL)
print(f"Found {len(fc_blocks)} fullCalendar blocks.")

for block in fc_blocks:
    print("--- BLOCK ---")
    # print(block[:500])
    
    # Look for 'events': ...
    events = re.findall(r"events\s*:\s*['\"](.*?)['\"]", block)
    if events:
        print(f"Events URL found: {events}")
        
    eventSources = re.findall(r"eventSources\s*:\s*\[(.*?)\]", block, re.DOTALL)
    if eventSources:
        # print(f"EventSources found: {eventSources}")
        urls = re.findall(r"url\s*:\s*['\"](.*?)['\"]", eventSources[0])
        print(f"URLs found in eventSources: {urls}")

# General search for "events" or "url" near fullCalendar
if "fullCalendar" in content:
    idx = content.find("fullCalendar")
    print("\n--- Context near fullCalendar ---")
    print(content[idx:idx+1000])
