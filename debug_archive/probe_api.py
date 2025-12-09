
import logging
from erp_client import ERPClient
import time
import os
import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def probe():
    os.environ['ERP_ID'] = 'dobong'
    os.environ['ERP_PASSWORD'] = '5555'
    
    client = ERPClient(headless=False)
    client.start()
    
    try:
        if client.login():
            print("Login successful")
            
            date_str = "2025-12-22"
            
            # Check idx=4 with multiple params
            idx = 4
            api_url = f"/index.php/dataFunction/getEvent?idx={idx}"
            print(f"Probing {api_url} with Mixed Params...")
            
            s_date = '2025-12-01'
            e_date = '2025-12-31'
            
            js_code = f"""() => {{
                return new Promise((resolve, reject) => {{
                    $.ajax({{
                        url: '{api_url}',
                        type: 'POST',
                        data: {{
                            start: '{s_date}', end: '{e_date}',
                            from: '{s_date}', to: '{e_date}',
                            startDate: '{s_date}', endDate: '{e_date}',
                            sDate: '{s_date}', eDate: '{e_date}',
                            date_start: '{s_date}', date_end: '{e_date}'
                        }},
                        success: function(data) {{ resolve(data); }},
                        error: function(xhr, status, err) {{ resolve('Error: ' + status); }}
                    }});
                }});
            }}"""
            
            try:
                data = client.page.evaluate(js_code)
                if isinstance(data, str) and data.startswith("["):
                    import json
                    try:
                        data = json.loads(data)
                    except:
                        pass
                        
                if isinstance(data, list):
                    print(f"IDX {idx}: Found {len(data)} events with mixed params")
                    if len(data) > 0:
                        print(f"Sample: {data[0]}")
                else:
                    print(f"IDX {idx}: Response not list: {str(data)[:100]}")
            except Exception as e:
                print(f"IDX {idx} Error: {e}")
                
        else:
            print("Login failed")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        time.sleep(2)
        client.close()

if __name__ == "__main__":
    probe()
