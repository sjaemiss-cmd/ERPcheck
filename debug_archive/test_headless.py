from erp_client import ERPClient

def test_headless():
    print("Testing ERPClient in HEADLESS mode...")
    client = ERPClient(headless=True)
    try:
        client.start()
        if client.login():
            print("Login successful.")
            missing = client.get_missing_memos()
            print(f"Missing Memos Found: {len(missing)}")
            for item in missing:
                print(item)
        else:
            print("Login failed.")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    test_headless()
