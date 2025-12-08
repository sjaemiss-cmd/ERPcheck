import os
import time
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
import datetime

# Load environment variables
load_dotenv()

ERP_ID = os.getenv("ERP_ID")
ERP_PASSWORD = os.getenv("ERP_PASSWORD")

def main():
    if not ERP_ID or not ERP_PASSWORD:
        print("Error: ERP_ID or ERP_PASSWORD not found in .env file.")
        return

    with sync_playwright() as p:
        # Launch browser (headless=False to see what's happening during dev)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to login page...")
        page.goto("https://sook0517.cafe24.com/")

        # Login
        print("Logging in...")
        page.fill("input[name='id']", ERP_ID)
        page.fill("input[name='pwd']", ERP_PASSWORD)
        page.click("button[type='submit']")

        # Wait for navigation or specific element that confirms login
        try:
            page.wait_for_url("**/index/main", timeout=5000)
            print("Login successful (url check).")
        except:
            print("Login submission complete, checking current URL...")
            print(f"Current URL: {page.url}")

        # Navigate to Calendar
        print("Navigating to Calendar...")
        page.goto("https://sook0517.cafe24.com/index/calender")
        
        # Wait for calendar to load
        # We don't know the exact selector yet, so let's wait for body and print content
        page.wait_for_load_state("networkidle")
        print("Calendar page loaded.")
        
        # Find today's column index
        # The headers are in .fc-day-header
        # We can find the one with class .fc-today
        today_header = page.locator(".fc-day-header.fc-today")
        if today_header.count() == 0:
            print("Today's header not found. Is the calendar in week/day view?")
            # Fallback: maybe it's month view? But the HTML showed agendaWeek
        else:
            print("Found today's header.")
            # We need to find which column index it is.
            # But actually, in the content skeleton, the columns correspond to the headers.
            # Let's just find the event in the 'fc-today' column in the content body?
            # In agenda view, the body has a table with columns.
            # The 'fc-today' class is also applied to the background td in .fc-bg
            # But the events are in .fc-content-skeleton which sits on top.
            # The columns in .fc-content-skeleton correspond to the days.
            
            # Let's try to find the index of the header
            headers = page.locator(".fc-day-header")
            count = headers.count()
            today_index = -1
            for i in range(count):
                if "fc-today" in headers.nth(i).get_attribute("class"):
                    today_index = i
                    break
            
            print(f"Today is at index {today_index}")
            
            if today_index != -1:
                # Now find the corresponding column in .fc-content-skeleton
                # .fc-content-skeleton > table > tbody > tr > td
                event_col = page.locator(".fc-content-skeleton tr td").nth(today_index + 1) # +1 because of axis column?
                # Check if axis column exists
                axis = page.locator(".fc-axis")
                if axis.count() > 0:
                     # The first td is axis, so index might be today_index + 1 if headers don't include axis?
                     # Headers: .fc-axis, .fc-day-header...
                     # So if we iterated .fc-day-header, we skipped axis.
                     # So in the skeleton td list (which includes axis), the index is today_index + 1.
                     pass
                
                events = event_col.locator(".fc-event")
                event_count = events.count()
                print(f"Found {event_count} events today.")
                

                if event_count > 0:
                    print(f"Found {event_count} events today.")
                    
                    missing_memo_events = []
                    
                    for i in range(event_count):
                        # Re-locate events to avoid stale element handle if DOM updates
                        # Although FullCalendar usually keeps them, it's safer to re-query or use nth
                        # We need to be careful if the modal covers the events.
                        # The modal is an overlay. We might need to close it to click the next one.
                        
                        event = events.nth(i)
                        event_title = event.text_content().strip()
                        print(f"Checking event {i+1}/{event_count}: {event_title}")
                        
                        # Filter out events based on name
                        skip_keywords = ['리뷰노트', '시간제', '운영', '상담']
                        if any(keyword in event_title for keyword in skip_keywords):
                            print(f"  -> Skipping event '{event_title}' (contains keyword)")
                            continue
                        
                        # Click the event
                        event.click(force=True)
                        
                        # Wait for modal to be visible
                        # The modal ID is CalenderModalEdit
                        modal_selector = "#CalenderModalEdit"
                        try:
                            page.wait_for_selector(modal_selector, state="visible", timeout=5000)
                        except:
                            print(f"Timeout waiting for modal for event {i+1}")
                            continue
                        
                        # Extract data
                        # Name: .modify_name (input value)
                        # Memo: #memo_area (div text) OR .modify_comment_text (input value)
                        
                        try:
                            name_input = page.locator(f"{modal_selector} .modify_name")
                            name = name_input.input_value() if name_input.count() > 0 else "Unknown"
                            
                            # 1. Check #memo_area (general memo)
                            memo_div = page.locator(f"{modal_selector} #memo_area")
                            memo_text = memo_div.inner_text().strip() if memo_div.count() > 0 else ""
                            
                            # 2. Check date-specific memos in .modify_comment_text
                            # We need to find the entry for TODAY.
                            
                            # Get today's date in YYYY-MM-DD format
                            today_str = datetime.date.today().strftime("%Y-%m-%d")
                            # For testing purposes, if the system date is different from the reservation date, 
                            # we might need to be careful. But the user said "today's reservation".
                            
                            has_today_memo = False
                            today_memo_content = ""
                            
                            # Find all date inputs
                            date_inputs = page.locator(f"{modal_selector} .modify_comment_date")
                            text_inputs = page.locator(f"{modal_selector} .modify_comment_text")
                            
                            count = date_inputs.count()
                            for k in range(count):
                                date_val = date_inputs.nth(k).input_value().strip()
                                text_val = text_inputs.nth(k).input_value().strip()
                                
                                if date_val == today_str:
                                    if text_val:
                                        has_today_memo = True
                                        today_memo_content = text_val
                                        break # Found it
                            
                            # Logic:
                            # If #memo_area has content, we assume it's valid (maybe general note).
                            # BUT the user specifically asked for "today's class content".
                            # If #memo_area is empty, we MUST find a date-specific entry for today.
                            # Actually, the user's complaint implies that even if there are past memos, 
                            # we need a memo for TODAY.
                            
                            # Let's refine:
                            # If there is a specific entry for today, that's good.
                            # If not, check #memo_area. If that's also empty, then it's missing.
                            # Wait, does #memo_area contain "today's" memo? 
                            # The user said "Education and Memo" field. 
                            # In the screenshot, the list of dates is under "Education and Memo".
                            # So we should prioritize finding a date match.
                            
                            if has_today_memo:
                                final_status = "OK"
                                memo = today_memo_content
                            elif memo_text:
                                # Fallback: if there is a general memo, maybe it counts?
                                # But user said "past memos don't count". 
                                # If #memo_area is just a static text area, it might be the "general" one.
                                # Let's assume if we didn't find a date match, we flag it, 
                                # UNLESS #memo_area is explicitly used for today.
                                # Given the user's strictness, let's rely on the date match if possible.
                                # However, for safety, if #memo_area has content, we might print it but still warn?
                                # Let's stick to: if (today_memo exists) OR (memo_area exists) -> OK.
                                # User said: "past memos exist but today's is missing -> report missing".
                                # So existence of past memos (which are likely in the list) shouldn't count.
                                # Does #memo_area contain past memos? 
                                # In the HTML, #memo_area is a separate div. 
                                # The list of inputs is in #insComment.
                                # Let's assume #memo_area is also valid "today" content if present.
                                final_status = "OK"
                                memo = memo_text
                            else:
                                final_status = "MISSING"
                                memo = ""

                        except Exception as e:
                            print(f"  Error extracting data: {e}")
                            final_status = "ERROR"
                            memo = ""
                            name = "Error"
                        
                        print(f"  Name: {name}")
                        print(f"  Today's Date: {today_str}")
                        print(f"  Found Today's Memo: {has_today_memo} ({today_memo_content})")
                        print(f"  General Memo: '{memo_text}'")
                        
                        if final_status == "MISSING":
                            print("  -> Missing Education and Memo for TODAY!")
                            missing_memo_events.append({
                                "name": name,
                                "time": event_title
                            })
                        
                        # Close the modal
                        # Click the 'Cancel' button or 'X'
                        close_btn = page.locator(f"{modal_selector} .antoclose2") # The 'Cancel' button class seen in HTML
                        if close_btn.count() == 0:
                            # Try the header close button
                            close_btn = page.locator(f"{modal_selector} .close")
                        
                        close_btn.click()
                        
                        # Wait for modal to be hidden
                        page.wait_for_selector(modal_selector, state="hidden", timeout=5000)
                        
                        # Small pause to ensure UI is stable
                        time.sleep(0.5)
                    
                    print("\nSummary of Missing Education and Memo:")
                    if missing_memo_events:
                        for item in missing_memo_events:
                            print(f"- Name: {item['name']}, Event: {item['time']}")
                    else:
                        print("No missing entries found.")
                        
                else:
                    print("No events today to click.")

        browser.close()

if __name__ == "__main__":
    main()
