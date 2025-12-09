import os
import json
import time
import logging
from playwright.sync_api import sync_playwright

class NaverClient:
    def __init__(self, headless=True):
        self.headless = headless
        self.session_file = "naver_session.json"
        self.base_url = "https://partner.booking.naver.com/bizes/697059/booking-list-view"

    def login(self):
        """
        Launches a browser for manual login and saves the session state.
        """
        with sync_playwright() as p:
            # Launch non-headless for manual interaction
            browser = p.chromium.launch(headless=False)
            context = browser.new_context()
            
            # Load existing session if available (to check if already logged in)
            if os.path.exists(self.session_file):
                try:
                    with open(self.session_file, 'r') as f:
                        state = json.load(f)
                    context.add_cookies(state['cookies'])
                except Exception as e:
                    logging.warning(f"Failed to load session: {e}")

            page = context.new_page()
            page.goto(self.base_url)
            
            print("Please log in to Naver manually in the opened browser.")
            print("Close the browser window when you are done (or it will close automatically in 3 minutes).")
            
            # Wait for user to log in and potentially close the browser
            # We can check for a specific element that indicates login success, or just wait for a timeout/close
            try:
                # Wait for a long time or until the user closes the page
                # A better approach might be to wait for a specific URL or element that appears after login
                # For now, let's wait for a specific element on the booking list page
                page.wait_for_selector(".booking-list-view", timeout=180000) # 3 minutes
                print("Login detected!")
            except Exception as e:
                print(f"Wait finished: {e}")

            # Save state
            storage = context.storage_state()
            with open(self.session_file, 'w') as f:
                json.dump(storage, f)
            print(f"Session saved to {self.session_file}")
            
            browser.close()
            return True

    def get_reservations(self):
        """
        Scrapes reservation data using the saved session.
        """
        if not os.path.exists(self.session_file):
            logging.error("No session file found. Please login first.")
            return []

        reservations = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            context = browser.new_context(storage_state=self.session_file)
            page = context.new_page()
            
            try:
                page.goto(self.base_url)
                page.wait_for_load_state("networkidle")
                # Wait for the list to load (div-based)
                try:
                    # Look for the list container
                    page.wait_for_selector("div[class*='BookingListView__list-contents']", timeout=10000)
                except:
                    logging.warning("List container not found, dumping page...")
                    page.screenshot(path="naver_debug.png")
                    with open("naver_dump.html", "w", encoding="utf-8") as f:
                        f.write(page.content())
                    return []

                # Scrape rows
                # Strategy: Find specific name cells to avoid duplicates
                # Use the specific class 'BookingListView__name__Oouqk' or similar specific ending
                # to avoid matching the inner 'name-area' div.
                name_cells = page.locator("div[class*='BookingListView__name__']")
                count = name_cells.count()
                logging.info(f"Found {count} name cells (potential rows).")
                
                for i in range(count):
                    try:
                        name_cell = name_cells.nth(i)
                        
                        # Traverse up to the row (parent of the cell)
                        # The structure seems to be: Row -> Cell (which is the name_cell)
                        # So we only need to go up ONE level to get the Row.
                        row = name_cell.locator("xpath=..") 
                        
                        # Extract Name first to identify the row in logs
                        name_text = name_cell.inner_text().strip()
                        
                        # Extract Status
                        # Status is in a sibling cell with class containing 'BookingListView__state'
                        status_cell = row.locator("div[class*='BookingListView__state']").first
                        status_text = status_cell.inner_text().strip() if status_cell.count() > 0 else "Unknown"
                        
                        # Filter: Only keep '신청' or '확정'
                        if status_text not in ['신청', '확정']:
                            logging.info(f"Skipping row '{name_text}' with status: {status_text}")
                            continue
                            
                        # Extract Usage Date (BookingListView__book-date)
                        # Format example: 25. 12. 10.(수) 오전 9:00
                        date_cell = row.locator("div[class*='BookingListView__book-date']").first
                        date_text = date_cell.inner_text().strip() if date_cell.count() > 0 else ""
                        
                        # Extract Product Name (BookingListView__host)
                        product_cell = row.locator("div[class*='BookingListView__host']").first
                        product_text = product_cell.inner_text().strip() if product_cell.count() > 0 else ""
                        
                        # Extract Request/Memo (BookingListView__comment)
                        # Based on dump: BookingListView__comment__-1Fck
                        request_cell = row.locator("div[class*='BookingListView__comment']").first
                        request_text = request_cell.inner_text().strip() if request_cell.count() > 0 else ""
                        
                        # Extract Phone Number (BookingListView__phone)
                        phone_cell = row.locator("div[class*='BookingListView__phone']").first
                        phone_text = phone_cell.inner_text().strip() if phone_cell.count() > 0 else ""
                        
                        # Calculate Duration
                        duration_min = 30 # Default
                        
                        # Logic:
                        # 1. '2종 시간제' or '1시간' or '체험권' -> 60 mins
                        # 2. '리뷰노트' in request -> 60 mins
                        # 3. '합격무제한' -> Unlimited (Keep default or set to specific if needed, currently 30 or 60?). 
                        #    User said only this is unlimited. Let's default to 60 for now to be safe, or 30.
                        #    Let's stick to the explicit 60 rules first.
                        
                        if "2종 시간제" in product_text or "1시간" in product_text or "체험권" in product_text:
                            duration_min = 60
                            logging.info(f"Row '{name_text}': Duration set to 60min due to Product keywords.")
                        elif "리뷰노트" in request_text:
                            duration_min = 60
                            logging.info(f"Row '{name_text}': Duration set to 60min due to '리뷰노트' in request.")
                        
                        # Parse Date/Time for structured data
                        # We'll do a best-effort parse here to help the GUI
                        # This avoids complex parsing in the GUI if we can do it here
                        # But for now, let's just pass the raw strings and let the GUI or a helper handle it
                        # Or better, let's try to normalize it here.
                        
                        # Combine for raw_data (legacy support for GUI display)
                        # Format: [Status] Name | Date: ... | Product: ... | Request: ... | Phone: ...
                        raw_data = f"[{status_text}] {name_text} | {date_text} | {product_text} | {request_text} | {phone_text}"
                        
                        logging.info(f"Collected: {raw_data}")
                        
                        reservations.append({
                            'source': 'Naver',
                            'raw_data': raw_data,
                            'name': name_text,
                            'status': status_text,
                            'date_str': date_text, # Raw date string
                            'product': product_text,
                            'request': request_text,
                            'phone': phone_text,
                            'duration_min': duration_min
                        })
                    except Exception as e:
                        logging.error(f"Error parsing row {i}: {e}")
                        continue
                        
            except Exception as e:
                logging.error(f"Error scraping Naver: {e}")
            
            browser.close()
            
        return reservations

if __name__ == "__main__":
    # Test
    client = NaverClient(headless=False)
    # client.login() # Uncomment to test login
    # print(client.get_reservations())
