import logging
import sys
import os
import datetime
from PyQt6.QtCore import QSettings

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from erp_client import ERPClient

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def test_seat_allocation():
    print("Reading credentials from settings...")
    settings = QSettings("MyCompany", "ERPCheck")
    saved_id = settings.value("erp_id", "")
    saved_pw = settings.value("erp_password", "")
    
    if not saved_id or not saved_pw:
        print("No saved credentials found in settings! Please run gui.py and log in first.")
        return

    print("Initializing ERP Client...")
    client = ERPClient(erp_id=saved_id, erp_password=saved_pw, headless=False) # Pass credentials explicitly, headed mode
    
    # We assume we are logged in or can login (headless=False to see if needed, but logic check doesn't need UI usually if using API? 
    # Actually erp_client uses Playwright, so it needs browser.
    if not client.login():
        print("Login failed!")
        return

    print("\n--- TEST: Review Note / Experience Logic ---")
    
    # Mock Data
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    name = "테스트_로봇"
    product = "1시간 체험권"     # Should trigger Review/Experience logic
    request = "리뷰노트 작성 희망" # Should trigger Review/Experience logic
    start_time = "10:00"
    end_time = "11:00"

    print(f"Checking availability for:")
    print(f"Date: {tomorrow} {start_time}-{end_time}")
    print(f"Product: {product}")
    print(f"Request: {request}")
    print("EXPECTED: Assigned seat should be one of [dobong-1, dobong-2, dobong-3, dobong-5, dobong-6]. NOT dobong-4, NOT dobong-9.")

    # Call Logic
    is_avail, msg, seat_id = client.check_availability(tomorrow, start_time, end_time, name, product, request)
    
    print(f"\nRESULT:")
    print(f"Available: {is_avail}")
    print(f"Message: {msg}")
    print(f"Assigned Seat: {seat_id}")

    # Verification
    valid_seats = ['dobong-1', 'dobong-2', 'dobong-3', 'dobong-5', 'dobong-6']
    if seat_id in valid_seats:
        print("\n[PASS] Logic confirmed. Valid seat assigned.")
    elif seat_id == 'dobong-4':
        print("\n[FAIL] Assigned dobong-4 which should be blocked!")
    elif seat_id == 'dobong-9':
        print("\n[FAIL] Assigned dobong-9 which should be for Consultation only!")
    else:
        print(f"\n[?] Assigned {seat_id}. Check if this is intended.")

    client.close()

if __name__ == "__main__":
    test_seat_allocation()
