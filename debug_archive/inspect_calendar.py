import os
import sys
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv
import datetime

load_dotenv()
ERP_ID = os.getenv("ERP_ID")
ERP_PASSWORD = os.getenv("ERP_PASSWORD")

def inspect_calendar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        
        print("Logging in...")
        page.goto("https://sook0517.cafe24.com/")
        page.fill("input[name='id']", ERP_ID)
        page.fill("input[name='pwd']", ERP_PASSWORD)
        page.click("button[type='submit']")
        try:
            page.wait_for_url("**/index/main", timeout=5000)
        except:
            print("Login wait timed out, proceeding anyway...")
        
        print("Navigating to Calendar...")
        page.goto("https://sook0517.cafe24.com/index/calender")
        page.wait_for_load_state("networkidle")
        
        print("Inspecting FullCalendar data...")
        # Try to get clientEvents from FullCalendar
        # We need to find the element that has the calendar. Usually it's #calendar or similar.
        # Based on previous logs, we looked for .fc-day-header, so it's definitely FullCalendar.
        
        # Let's try to find the ID of the calendar container.
        # We can guess or just look for the element with class 'fc'.
        
        # Execute JS to find events
        try:
            events = page.evaluate("""() => {
                // Try common selectors
                var cal = $('#calendar');
                if (cal.length === 0) cal = $('.calendar');
                if (cal.length === 0) cal = $('div[id*="calendar"]');
                
                if (cal.length > 0 && cal.fullCalendar) {
                    return cal.fullCalendar('clientEvents');
                }
                return "FullCalendar instance not found";
            }""")
            
            if isinstance(events, str):
                print(f"JS Result: {events}")
            else:
                print(f"Found {len(events)} events total.")
                # Filter for today
                today_str = datetime.date.today().strftime("%Y-%m-%d")
                today_events = []
                for e in events:
                    # FullCalendar events usually have start/end as Moment objects or strings
                    # We need to serialize them in JS or handle them here.
                    # Wait, passing complex objects back from evaluate might fail if they have circular refs.
                    # Better to map them in JS.
                    pass
                    
        except Exception as e:
            print(f"Error executing JS: {e}")

        # Better approach: return simplified list from JS
        data = page.evaluate("""() => {
            var cal = $('#calendar'); 
            if (cal.length === 0) cal = $('.fc').parent(); 
            
            if (cal.length > 0 && cal.fullCalendar) {
                var events = cal.fullCalendar('clientEvents');
                return events.map(e => ({
                    title: e.title,
                    start: e.start ? e.start.format() : null,
                    end: e.end ? e.end.format() : null,
                    id: e._id
                }));
            }
            return null;
        }""")
        
        if data:
            print(f"Successfully retrieved {len(data)} events.")
            # Print a few to see structure
            for i, e in enumerate(data[:5]):
                print(f"{i}: {e}")
                
            # Check for today's events
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            print(f"Checking for events on {today_str}...")
            today_events = [e for e in data if e['start'] and e['start'].startswith(today_str)]
            print(f"Found {len(today_events)} events for today.")
            for e in today_events:
                print(f" - {e['title']} ({e['start']} ~ {e['end']})")
        else:
            print("Could not retrieve events via JS.")
            
        browser.close()

if __name__ == "__main__":
    inspect_calendar()
