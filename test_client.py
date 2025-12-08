from erp_client import ERPClient

def test():
    client = ERPClient(headless=False)
    client.start()
    if client.login():
        missing = client.get_missing_memos()
        print("Missing Memos:", missing)
    client.close()

if __name__ == "__main__":
    test()
