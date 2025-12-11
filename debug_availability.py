from erp_client import ERPClient
import datetime
import logging
from PyQt6.QtCore import QSettings, QCoreApplication
import sys

# Setup logging
logging.basicConfig(level=logging.INFO)

def test_fetch():
    # Mock QSettings for credentials (or use hardcoded if needed for test, but better to use existing)
    # Since we are running outside GUI, QSettings might not work if app not created?
    # Actually QSettings works if Organization/App name set.
    
    app = QCoreApplication(sys.argv)
    app.setOrganizationName("MyCompany")
    app.setApplicationName("ERPCheck")
    
    settings = QSettings()
    erp_id = settings.value("erp_id", "")
    erp_password = settings.value("erp_password", "")
    
    if not erp_id or not erp_password:
        print("No credentials found in settings.")
        return

    client = ERPClient(headless=True, erp_id=erp_id, erp_password=erp_password)
    client.start() # Initialize browser
    if client.login():
        target_date = datetime.date.today()
        print(f"Fetching events for {target_date}...")
        
        # Verify fix with get_events_range
        target_date_str = "2025-12-22"
        target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
        print(f"Verifying fix for {target_date}...")
        
        events = client.get_events_range(target_date, target_date + datetime.timedelta(days=1))
        print(f"Found {len(events)} events.")
        
        for e in events:
            print(f"  - {e['title']} | {e['start'].time()}-{e['end'].time()} | Resource: {e.get('resourceId')}")
                
    client.close()

if __name__ == "__main__":
    test_fetch()
