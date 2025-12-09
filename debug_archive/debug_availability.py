
import os
import logging
from erp_client import ERPClient
import time

# Setup basic logging to console
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def debug_run():
    # Set credentials for auto-login
    os.environ['ERP_ID'] = 'sook0517'
    os.environ['ERP_PASSWORD'] = 'sook0517'
    
    print("Initializing ERP Client...")
    client = ERPClient(headless=False)
    client.start()
    
    if client.login():
        print("Login Successful.")
        
        target_date = "2025-12-22"
        print(f"Fetching events for {target_date}...")
        
        # 1. Fetch raw events
        events = client.get_events_for_date(target_date)
        
        if events is None:
            print("!!! get_events_for_date returned None (Error) !!!")
        else:
            print(f"Found {len(events)} events.")
            for i, e in enumerate(events):
                print(f"[{i}] Title: {e['title']}, Start: {e['start']}, End: {e['end']}, Resource: {e['resourceId']}")
                
        # 2. Test Availability Logic
        print("\nTesting Availability Logic for dobong-1...")
        test_start = "10:00"
        test_end = "11:00"
        
        # Manually verify logic against fetched events
        if events:
            import datetime
            t_start = datetime.datetime.strptime(f"{target_date} {test_start}", "%Y-%m-%d %H:%M")
            t_end = datetime.datetime.strptime(f"{target_date} {test_end}", "%Y-%m-%d %H:%M")
            
            for e in events:
                r_id = str(e.get('resourceId', ''))
                # Simplified check for dobong-1
                if '1' in r_id: 
                    print(f"Checking {e['title']} ({e['start']} ~ {e['end']}) vs ({t_start} ~ {t_end})")
                    if e['start'] < t_end and e['end'] > t_start:
                        print(f"  -> OVERLAP DETECTED!")
                    else:
                        print(f"  -> No overlap")
                        
    else:
        print("Login Failed.")
        
    # client.close()

if __name__ == "__main__":
    debug_run()
