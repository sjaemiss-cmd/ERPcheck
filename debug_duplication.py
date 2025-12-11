from erp_client import ERPClient
import datetime
import logging
from PyQt6.QtCore import QSettings, QCoreApplication
import sys
import time

# Setup logging
logging.basicConfig(level=logging.INFO)

def test_duplication():
    app = QCoreApplication(sys.argv)
    app.setOrganizationName("MyCompany")
    app.setApplicationName("ERPCheck")
    
    settings = QSettings()
    erp_id = settings.value("erp_id", "")
    erp_password = settings.value("erp_password", "")
    
    if not erp_id or not erp_password:
        print("No credentials found.")
        return

    client = ERPClient(headless=True, erp_id=erp_id, erp_password=erp_password)
    client.start()
    if client.login():
        target_date_str = "2025-12-22"
        print(f"Fetching events for {target_date_str}...")
        
        # Navigate first
        client.page.evaluate(f"$('#calendar').fullCalendar('gotoDate', '{target_date_str}');")
        client.page.evaluate(f"$('#calendar').fullCalendar('changeView', 'month');")
        
        # Direct API test
        print("Testing Direct API Calls...")
        
        start_date = "2025-12-01"
        end_date = "2026-01-12"
        
        for idx in [20, 21]:
            url = f"https://sook0517.cafe24.com/index.php/dataFunction/getEvent?idx={idx}&start={start_date}&end={end_date}"
            print(f"GET {url}")
            
            response = client.page.request.get(url)
            if response.ok:
                data = response.json()
                print(f"idx={idx} returned {len(data)} events.")
                if len(data) > 0:
                    print(f"Sample Event: {data[0]}")
                    # Check for device/resource field
                    keys = data[0].keys()
                    print(f"Keys: {keys}")
            else:
                print(f"Failed: {response.status}")
                
    client.close()

if __name__ == "__main__":
    test_duplication()
