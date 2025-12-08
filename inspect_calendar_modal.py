from playwright.sync_api import sync_playwright
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def inspect_calendar():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True) # Try headless to avoid window issues
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1. Login
            logging.info("Navigating to login page...")
            page.goto("https://sook0517.cafe24.com/admin/login")
            
            logging.info("Logging in...")
            page.fill("input[name='admin_id']", "sook0517")
            page.fill("input[name='admin_pass']", "sook0517!!")
            page.click("button[type='submit']")
            page.wait_for_load_state("networkidle")
            
            # 2. Navigate to Calendar
            logging.info("Navigating to Calendar...")
            page.goto("https://sook0517.cafe24.com/index/calender")
            page.wait_for_load_state("networkidle")
            time.sleep(3) # Wait for calendar to render

            # 3. Dump Calendar HTML to find 'Add Schedule' button
            content = page.content()
            with open("calendar_dump.html", "w", encoding="utf-8") as f:
                f.write(content)
            logging.info("Saved calendar_dump.html")

            # 4. Search for '일정 추가' button
            logging.info("Searching for '일정 추가' button...")
            # Try various selectors
            buttons = page.locator("button, a, div[role='button']").all()
            target_btn = None
            for btn in buttons:
                txt = btn.inner_text()
                if "일정 추가" in txt or "일정추가" in txt:
                    logging.info(f"Found button with text: {txt}")
                    target_btn = btn
                    break
            
            if target_btn:
                target_btn.click()
                logging.info("Clicked '일정 추가' button.")
                time.sleep(2) # Wait for modal
                
                # 5. Dump Modal HTML
                modal_content = page.content()
                with open("modal_dump.html", "w", encoding="utf-8") as f:
                    f.write(modal_content)
                logging.info("Saved modal_dump.html")
                
                # Take screenshot
                page.screenshot(path="modal_screenshot.png")
            else:
                logging.warning("'일정 추가' button not found via text search.")
                # Try finding by class or ID if known from previous dumps (but we don't have one yet)

        except Exception as e:
            logging.error(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    inspect_calendar()
