import logging
import datetime
from erp_client import ERPClient

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def test_availability():
    client = ERPClient()
    client.start()
    if not client.login():
        logging.error("Login failed")
        return

    # Test Date: Tomorrow
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")
    
    logging.info(f"Checking availability for {tomorrow_str}...")
    
    # Check a likely free slot (e.g., 04:00 AM)
    is_free = client.check_availability(tomorrow_str, "04:00", "05:00")
    logging.info(f"04:00 - 05:00 Available? {is_free}")
    
    # Check a likely busy slot (if any, or just another slot)
    # We can't know for sure without seeing data, but let's just check another one
    is_free_2 = client.check_availability(tomorrow_str, "14:00", "15:00")
    logging.info(f"14:00 - 15:00 Available? {is_free_2}")
    
    client.close()

if __name__ == "__main__":
    test_availability()
