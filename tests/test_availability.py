import logging
import sys
import os

# Add parent directory to path to allow importing erp_client
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from erp_client import ERPClient
import time
import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def reproduce():
    # Credentials hardcoded for test
    os.environ['ERP_ID'] = 'dobong'
    os.environ['ERP_PASSWORD'] = '5555'
    
    client = ERPClient(headless=False) 
    client.start()
    
    try:
        if client.login():
            print("Login successful")
            
            # User reported issue: Dec 22nd 2025, dobong-1~6 are full.
            # We want to check if the system correctly reports UN-available.
            
            date_str = "2025-12-22"
            start_time = "10:00"
            end_time = "11:00"
            name = "TestVerifyAPI"
            product = "1시간 (체험권)"
            request = "리뷰노트" # Targets seats 1,2,3,5,6
            
            print(f"Checking availability for {date_str} {start_time}-{end_time}...")
            
            # Verify events fetch first
            events = client.get_events_for_date(date_str)
            if events:
                print(f"Events found: {len(events)}")
                for e in events:
                    print(f" - {e['title']} ({e['resourceId']}): {e['start']} ~ {e['end']}")
            else:
                print("No events found or API error.")

            # Check availability logic
            is_avail, msg, seat = client.check_availability(
                date_str, start_time, end_time, name, product, request
            )
            
            print(f"\nFINAL RESULT: Available={is_avail}, Msg={msg}, Seat={seat}")
            
            if not is_avail and "중복" in msg:
                print("SUCCESS: System correctly detected overlap!")
            elif is_avail:
                print("FAILURE: System reported Available despite expected overlap.")
            else:
                print(f"Pass/Fail uncertain: {msg}")
             
        else:
            print("Login failed")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        time.sleep(2)
        client.close()

if __name__ == "__main__":
    reproduce()
