import os
import time
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

ERP_ID = os.getenv("ERP_ID")
ERP_PASSWORD = os.getenv("ERP_PASSWORD")
ERP_URL = os.getenv("ERP_URL", "https://sook0517.cafe24.com")

def debug_structure():
    if not ERP_ID or not ERP_PASSWORD:
        print("Error: ERP_ID or ERP_PASSWORD not set in .env")
        return

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print(f"Logging in to {ERP_URL}...")
        page.goto(f"{ERP_URL}/")
        
        # Login
        page.fill("input[name='id']", ERP_ID)
        page.fill("input[name='pwd']", ERP_PASSWORD)
        page.click("button[type='submit']")
        
        # Wait for login to complete (either URL change or specific element)
        try:
            page.wait_for_url("**/index/main", timeout=10000)
            print("Login successful.")
        except:
            print("Login wait timed out. Checking if redirected...")
            if "login" in page.url:
                print("Still on login page. Login might have failed.")
                page.screenshot(path="debug_login_fail.png")
                return

        # Navigate to Member List
        print("Navigating to Member List...")
        page.goto(f"{ERP_URL}/index/member")
        page.wait_for_load_state("networkidle")
        
        # Dump Member List HTML
        with open("debug_member_list.html", "w", encoding="utf-8") as f:
            f.write(page.content())
        print("Saved debug_member_list.html")
        
        # Screenshot Member List
        page.screenshot(path="debug_list.png")
        print("Saved debug_list.png")

        # Click first member to get Detail View
        print("Opening first member detail...")
        # Assuming the name is a link in the table. 
        # Based on previous exploration, it's likely in a table row.
        # We'll try to find the first link in the tbody.
        try:
            first_link = page.locator("table tbody tr a").first
            if first_link.count() > 0:
                first_link.click()
                
                # Wait for modal or page load
                # Previous exploration suggested a modal with class 'modal' or id 'modifyModalLabel'
                # We'll wait for network idle again or a specific selector if we knew it.
                # For now, just wait a bit and check for modal visibility.
                time.sleep(2) 
                page.wait_for_load_state("networkidle")
                
                # Dump Detail HTML
                # If it's a modal, we might want to dump the modal content specifically, 
                # but dumping the whole page (with modal open) is safer.
                with open("debug_member_detail.html", "w", encoding="utf-8") as f:
                    f.write(page.content())
                print("Saved debug_member_detail.html")
                
                # Screenshot Detail
                page.screenshot(path="debug_detail.png")
                print("Saved debug_detail.png")
            else:
                print("No member links found in the table.")
        except Exception as e:
            print(f"Error interacting with member list: {e}")

        browser.close()

if __name__ == "__main__":
    debug_structure()
