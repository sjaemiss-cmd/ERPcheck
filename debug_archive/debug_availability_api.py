
import os
import logging
from playwright.sync_api import sync_playwright
import time
import json

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def debug_api():
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        
        # 1. Login
        print("Navigating to login...")
        page.goto("https://sook0517.cafe24.com/")
        
        # Dialog handler
        page.on("dialog", lambda d: d.accept())
        
        # Provide inputs for manual entry convenience
        try:
             page.fill("input[name='id']", "dobong")
             page.fill("input[name='pwd']", "5555")
        except:
             pass
        
        print("!!! PLEASE LOG IN MANUALLY IF NEEDED !!!")
        print("Waiting 30 seconds for you to reach the main page (index/main)...")
        
        try:
            page.wait_for_url("**/index/main", timeout=30000)
            print("Login detected (URL matched).")
        except:
            print("Login wait timeout. Proceeding anyway, please ensure you are logged in.")
            
        # 2. Setup Response Listener
        def handle_response(response):
            print(f"[NET] {response.url} ({response.headers.get('content-type','')})")
            if "json" in response.headers.get("content-type", ""):
                 try:
                    data = response.json()
                    if isinstance(data, list) or isinstance(data, dict):
                         # Save any JSON to see what we get
                         clean_name = response.url.split("/")[-1].split("?")[0]
                         with open(f"api_capture_{clean_name}.json", "w", encoding="utf-8") as f:
                             json.dump(data, f, ensure_ascii=False, indent=2)
                 except:
                    pass

        page.on("response", handle_response)
        
        # 3. Navigate to Calendar and Date
        print("Navigating to Calendar...")
        page.goto("https://sook0517.cafe24.com/index/calender")
        page.wait_for_load_state("networkidle")
        
        # Screenshot to see current state
        page.screenshot(path="debug_api_state.png")
        
        target_date = "2025-12-22"
        print(f"Switching to date {target_date}...")
        
        # Force refresh to trigger API
        # Only if fullCalendar is available
        try:
            page.evaluate(f"$('#calendar').fullCalendar('gotoDate', '{target_date}')")
            page.evaluate("$('#calendar').fullCalendar('refetchEvents')")
        except Exception as e:
            print(f"JS execution failed: {e}")
            print("Please manually navigate to the calendar date if needed.")
        
        print("Listening for network responses for 20 seconds...")
        time.sleep(20)
        
        browser.close()

if __name__ == "__main__":
    debug_api()
