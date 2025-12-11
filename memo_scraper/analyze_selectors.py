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

def analyze_selectors():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Login
        page.goto("https://sook0517.cafe24.com/")
        page.fill("input[name='id']", ERP_ID)
        page.fill("input[name='pwd']", ERP_PASSWORD)
        page.click("button[type='submit']")
        
        try:
            page.wait_for_url("**/index/main", timeout=5000)
        except:
            print("Main page wait timed out, checking if we are logged in...")
        
        # Go to member list (or check if we are already there)
        if "member" not in page.url:
            page.goto("https://sook0517.cafe24.com/index/member")
        
        page.wait_for_load_state("networkidle")
        
        # 1. Find Registration Date Column Index
        print("--- Table Headers ---")
        headers = page.locator("table thead th").all_inner_texts()
        for i, h in enumerate(headers):
            print(f"Index {i}: {h.strip()}")
            
        # 2. Find Memo Field Selector
        print("\n--- Member Detail Modal ---")
        # Click first member
        page.locator("table tbody tr a").first.click()
        
        # Wait for modal
        page.wait_for_selector(".modal.in", state="visible")
        
        # Look for labels containing "메모" or "교육"
        labels = page.locator(".modal.in label").all_inner_texts()
        found_memo = False
        for l in labels:
            if "메모" in l or "교육" in l:
                print(f"Found Label: {l.strip()}")
                found_memo = True
                
        # Dump the specific area if found, or whole modal body if not
        if found_memo:
            # Try to find the input/textarea associated with it
            # Usually it's in the same form-group
            print("Dumping form-group containing '메모':")
            # This is a bit tricky with playwright selectors, so let's dump the HTML of the form-group
            # We iterate over form-groups
            groups = page.locator(".modal.in .form-group")
            count = groups.count()
            for i in range(count):
                group = groups.nth(i)
                if "메모" in group.inner_text() or "교육" in group.inner_text():
                    print(group.inner_html())
        else:
            print("Could not find explicit 'Memo' label. Dumping all labels:")
            print(labels)

        browser.close()

if __name__ == "__main__":
    analyze_selectors()
