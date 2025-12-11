import sys
import os
import time
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Load env from parent dir
base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(base_path, '.env'))

ERP_ID = os.getenv("ERP_ID")
ERP_PASSWORD = os.getenv("ERP_PASSWORD")

def explore():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        print("Navigating to login page...")
        page.goto("https://sook0517.cafe24.com/")
        
        print(f"Logging in with {ERP_ID}...")
        page.fill("input[name='id']", ERP_ID)
        page.fill("input[name='pwd']", ERP_PASSWORD)
        
        # Click submit
        page.click("button[type='submit']")
        
        # Wait for navigation
        try:
            page.wait_for_url("**/index/main", timeout=10000)
            print("Login successful (URL match)")
        except:
            print(f"Login wait timed out. Current URL: {page.url}")
            if "login" not in page.url:
                print("But URL seems to have changed, assuming success?")
            else:
                print("Still on login page.")
                # Check for alert text if possible (dialogs are auto-dismissed usually but we need listener)
        
        # Go to member list regardless
        print("Navigating to member list...")
        page.goto("https://sook0517.cafe24.com/index/member")
        page.wait_for_load_state("networkidle")
        
        print("Page URL:", page.url)
        if "login" in page.url:
             print("Redirected to login. Login definitely failed.")
             return

        # Dump table
        tables = page.locator("table")
        count = tables.count()
        print(f"Found {count} tables.")
        
        if count > 0:
            first_table = tables.nth(0)
            print("First table HTML (partial):")
            print(first_table.inner_html()[:2000])
            
            # Find links
            links = first_table.locator("tbody tr a") # Assuming standard table structure
            if links.count() > 0:
                print(f"Found {links.count()} links in table rows.")
                first_link = links.nth(0)
                print(f"Clicking first link: {first_link.inner_text()}")
                
                first_link.click()
                time.sleep(3)
                
                print("Page content after click (partial):")
                modals = page.locator(".modal.in")
                if modals.count() > 0:
                    print("Modal detected!")
                    print(modals.nth(0).inner_html()[:5000])
                else:
                    # Maybe it's not a modal but a page?
                    print(page.content()[:5000])
        
        browser.close()

if __name__ == "__main__":
    explore()
