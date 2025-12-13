import os
import json
import time
import logging
from playwright.sync_api import sync_playwright

class KakaoClient:
    def __init__(self, headless=True):
        self.headless = headless
        self.session_file = "kakao_session.json"
        self.base_url = "https://business.kakao.com/_hxlxnIs/chats"

    def login(self):
        """
        Launches a browser for manual login and saves the session state.
        """
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            context = browser.new_context()
            
            if os.path.exists(self.session_file):
                try:
                    with open(self.session_file, 'r') as f:
                        state = json.load(f)
                    context.add_cookies(state['cookies'])
                except Exception as e:
                    logging.warning(f"Failed to load session: {e}")

            page = context.new_page()
            page.goto(self.base_url)
            
            print("Please log in to Kakao Business manually in the opened browser.")
            print("Close the browser window when you are done (or it will close automatically in 3 minutes).")
            
            try:
                print("Waiting for login success...")
                # Poll for success URL
                max_retries = 600 # 10 minutes
                for _ in range(max_retries):
                    if page.is_closed():
                        print("Browser closed by user.")
                        break
                    
                    current_url = page.url
                    # Check if we are on the target business page
                    if "business.kakao.com" in current_url and "/_hxlxnIs/chats" in current_url:
                        print(f"Login detected! URL: {current_url}")
                        # Wait a bit for cookies to settle
                        time.sleep(3)
                        
                        # Save state
                        storage = context.storage_state()
                        with open(self.session_file, 'w') as f:
                            json.dump(storage, f)
                        print(f"Session saved to {self.session_file}")
                        break
                    
                    time.sleep(1)
                else:
                    print("Login timed out.")

            except Exception as e:
                print(f"Error during login wait: {e}")
            
            browser.close()
            return True

    def get_chats(self):
        """
        Scrapes chat list using the saved session.
        """
        if not os.path.exists(self.session_file):
            logging.error("No session file found. Please login first.")
            return []

        chats = []
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            context = browser.new_context(storage_state=self.session_file)
            page = context.new_page()
            
            try:
                page.goto(self.base_url)
                page.wait_for_load_state("networkidle")
                
                if "login" in page.url:
                    logging.error("Session expired or invalid. Please login again.")
                    return []

                # Wait for list
                # Note: Kakao Business Center DOM is complex and dynamic (React/Vue).
                # We need to find the list items.
                # Assuming a generic list structure for now.
                # In a real scenario, we would inspect the page source.
                # Let's try to find elements that look like chat items.
                page.wait_for_selector("li", timeout=10000)
                
                # This selector is a guess. We might need to adjust it.
                # Usually chat lists are in <ul> or <div>s.
                # Let's grab all text from list items that contain typical time formats or names.
                items = page.locator("li") 
                count = items.count()
                
                for i in range(count):
                    item = items.nth(i)
                    text = item.inner_text()
                    # Simple filter to avoid menu items
                    if len(text) > 10 and "\n" in text: 
                        chats.append({
                            "source": "Kakao",
                            "raw_data": text.replace("\n", " ")[:50] + "..." # Preview
                        })
                        
            except Exception as e:
                logging.error(f"Error scraping Kakao: {e}")
            
            browser.close()
            
        return chats

if __name__ == "__main__":
    client = KakaoClient(headless=False)
    # client.login()
    # print(client.get_chats())
