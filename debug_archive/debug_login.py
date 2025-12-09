
from playwright.sync_api import sync_playwright

def dump_login():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://sook0517.cafe24.com/")
        content = page.content()
        with open("login_dump.html", "w", encoding="utf-8") as f:
            f.write(content)
        browser.close()
        print("Login page dumped to login_dump.html")

if __name__ == "__main__":
    dump_login()
