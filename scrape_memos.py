import os
import time
import csv
from datetime import datetime
from dateutil.relativedelta import relativedelta
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

ERP_ID = os.getenv("ERP_ID")
ERP_PASSWORD = os.getenv("ERP_PASSWORD")
ERP_URL = os.getenv("ERP_URL", "https://sook0517.cafe24.com")

def is_within_last_6_months(date_str):
    """
    Checks if the given date string is within the last 6 months from today.
    Expects YYYY-MM-DD format.
    """
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        today = datetime.now().date()
        six_months_ago = today - relativedelta(months=6)
        return six_months_ago <= target_date <= today
    except ValueError:
        return False

def scrape():
    if not ERP_ID or not ERP_PASSWORD:
        print("Error: ERP_ID or ERP_PASSWORD not set in .env")
        return

    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print(f"Logging in to {ERP_URL}...")
        page.goto(f"{ERP_URL}/")
        
        # Login
        page.fill("input[name='id']", ERP_ID)
        page.fill("input[name='pwd']", ERP_PASSWORD)
        page.click("button[type='submit']")
        
        try:
            page.wait_for_url("**/index/main", timeout=10000)
            print("Login successful.")
        except:
            if "login" in page.url:
                print("Login failed or timed out.")
                return
            print("Login assumed successful (redirected).")

        # Navigate to Member List
        print("Navigating to Member List...")
        page.goto(f"{ERP_URL}/index/member")
        page.wait_for_load_state("networkidle")

        # Prepare CSV
        csv_file = "member_memos.csv"
        # Using utf-8-sig for Excel compatibility
        with open(csv_file, mode='w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(["Name", "Registration Date", "General Memo", "Education Memos"])

        page_num = 1
        stop_scraping = False
        
        while not stop_scraping:
            print(f"Processing Page {page_num}...")
            
            # Select rows
            # Selector provided: table.jambo_table tbody tr
            rows = page.locator("table.jambo_table tbody tr")
            count = rows.count()
            print(f"Found {count} members on page {page_num}.")
            
            if count == 0:
                break

            for i in range(count):
                try:
                    # Fetch row
                    row = rows.nth(i)
                    
                    # Extract Date
                    # Selector provided: td:nth-child(11)
                    date_text_full = row.locator("td:nth-child(11)").inner_text().strip()
                    # Format: 2025-12-10 18:43:40 [17시간 경과]
                    if not date_text_full:
                        continue
                        
                    date_str = date_text_full.split(' ')[0]
                    
                    # Parse date for logic
                    try:
                        row_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                    except ValueError:
                        continue
                        
                    today = datetime.now().date()
                    six_months_ago = today - relativedelta(months=6)
                    
                    # Stop condition: If date is older than 6 months
                    if row_date < six_months_ago:
                        print(f"Date {date_str} is older than 6 months. Stopping scraping.")
                        stop_scraping = True
                        break
                        
                    # Skip if future date (optional, but good for strictness)
                    if row_date > today:
                        continue
                    
                    # Extract Name
                    # Selector provided: td:nth-child(2) a
                    # Use .first to avoid strict mode violation if multiple links exist (e.g. hidden modals)
                    name_el = row.locator("td:nth-child(2) a").first
                    name = name_el.inner_text().strip()
                    
                    print(f"Processing [{i+1}/{count}]: {name} ({date_str})")
                    
                    # Click to open modal
                    name_el.click()
                    
                    # Wait for modal
                    # Selector provided: .modifyModal[style*='display: block']
                    modal_selector = ".modifyModal[style*='display: block']"
                    try:
                        page.wait_for_selector(modal_selector, state="visible", timeout=5000)
                    except:
                        print(f"  -> Timeout waiting for modal for {name}")
                        continue
                    
                    # Scrape Memos
                    modal = page.locator(modal_selector)
                    
                    # General Memo
                    # Selector provided: textarea[name='memo']
                    general_memo = modal.locator("textarea[name='memo']").input_value()
                    
                    # Education Memos
                    # Selectors provided: input[name='date[]'] and input[name='comment[]']
                    dates = modal.locator("input[name='date[]']").evaluate_all("els => els.map(e => e.value)")
                    comments = modal.locator("input[name='comment[]']").evaluate_all("els => els.map(e => e.value)")
                    
                    education_entries = []
                    for d, c in zip(dates, comments):
                        # Only add if there is content
                        if d.strip() or c.strip():
                            education_entries.append(f"[{d}] {c}")
                    
                    education_str = " | ".join(education_entries)
                    
                    # Save to CSV immediately
                    with open(csv_file, mode='a', newline='', encoding='utf-8-sig') as f:
                        writer = csv.writer(f)
                        writer.writerow([name, date_str, general_memo, education_str])
                    
                    # Close Modal
                    # Try clicking the close button first
                    try:
                        modal.locator("button.close").click()
                    except:
                        page.keyboard.press("Escape")
                    
                    # Wait for modal to hide
                    page.wait_for_selector(modal_selector, state="hidden", timeout=5000)
                    
                    # Sleep to avoid rate limiting
                    time.sleep(0.5)
                    
                except Exception as e:
                    print(f"Error processing row {i}: {e}")
                    # Attempt to recover by closing modal if open
                    try:
                        page.keyboard.press("Escape")
                        time.sleep(1)
                    except:
                        pass
            
            if stop_scraping:
                break
                
            # Pagination Logic
            next_btn = page.locator(".btnNext a")
            if next_btn.count() > 0:
                print("Navigating to next page...")
                next_btn.click()
                page.wait_for_load_state("networkidle")
                page_num += 1
                time.sleep(1) # Extra buffer
            else:
                print("No next page found. Finished.")
                break

        print(f"Scraping completed. Data saved to {csv_file}")
        browser.close()

if __name__ == "__main__":
    scrape()
