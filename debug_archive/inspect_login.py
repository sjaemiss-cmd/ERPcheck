from playwright.sync_api import sync_playwright

def inspect():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://sook0517.cafe24.com/")
        print(page.content())
        browser.close()

if __name__ == "__main__":
    inspect()
