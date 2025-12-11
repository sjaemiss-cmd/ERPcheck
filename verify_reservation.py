import logging
import time
from erp_client import ERPClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("verify_reservation.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)

print("Script started...")

def verify_reservation():
    print("Initializing ERP Client...")
    client = ERPClient(headless=False) # Show browser
    try:
        logging.info("Starting ERP Client...")
        print("Starting ERP Client...")
        client.start()
        
        logging.info("Logging in...")
        if not client.login():
            logging.error("Login failed")
            return

        # Test Data
        test_data = {
            'date': '2025-12-12', # Future date
            'start_time': '14:00',
            'end_time': '15:00',
            'name': '테스트예약',
            'phone': '010-0000-0000',
            'product': '2종 시간제',
            'option': '1시간', # Should map to 6236
            'request': ''
        }
        
        target_seat = 'dobong-2'
        logging.info(f"Attempting to create reservation on {target_seat}...")
        
        # Inject a custom debug method into the client instance for this test
        original_create = client.create_reservation
        
        def debug_create(data, seat_id=None):
            # We will just run the original method, but we want to inspect the page state 
            # *during* the execution. Since we can't easily hook into the middle of the method
            # without modifying erp_client.py, let's modify erp_client.py to be more verbose 
            # or just trust the logs for now, but add a pre-check here.
            
            # Actually, let's just run it and rely on the enhanced logging I added to erp_client.py
            # But I'll add a post-failure inspection here if it returns False.
            return original_create(data, seat_id)

        success = client.create_reservation(test_data, seat_id=target_seat)
        
        if success:
            logging.info("Reservation creation SUCCESS!")
        else:
            logging.error("Reservation creation FAILED.")
            # Dump page source for analysis
            with open("failed_reservation_page.html", "w", encoding="utf-8") as f:
                f.write(client.page.content())
            logging.info("Dumped page content to failed_reservation_page.html")
            
    except Exception as e:
        logging.error(f"Verification failed: {e}")
    finally:
        logging.info("Closing client...")
        # client.close() # Keep open to inspect

if __name__ == "__main__":
    verify_reservation()
