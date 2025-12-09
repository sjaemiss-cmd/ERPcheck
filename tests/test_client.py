import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

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
