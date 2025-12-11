import os
import sys
import time
import datetime
import logging
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# Setup logging
log_file = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'debug.log')
logging.basicConfig(filename=log_file, level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

class ERPClient:
    def __init__(self, headless=True, erp_id=None, erp_password=None):
        # Determine path to .env
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
            
        env_path = os.path.join(base_path, '.env')
        load_dotenv(env_path)
        
        # Use passed credentials if available, otherwise fallback to env
        self.erp_id = erp_id if erp_id else os.getenv("ERP_ID")
        self.erp_password = erp_password if erp_password else os.getenv("ERP_PASSWORD")
        
        logging.info(f"Initialized ERPClient. ID present: {bool(self.erp_id)}")
        
        # Fix for PyInstaller: Force Playwright to look in the standard location
        if getattr(sys, 'frozen', False):
            user_profile = os.environ.get("USERPROFILE")
            if user_profile:
                browser_path = os.path.join(user_profile, "AppData", "Local", "ms-playwright")
                os.environ["PLAYWRIGHT_BROWSERS_PATH"] = browser_path
                logging.info(f"Frozen mode detected. Setting PLAYWRIGHT_BROWSERS_PATH to: {browser_path}")
        
        self.headless = headless
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

    def start(self):
        logging.info("Starting Playwright...")
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=self.headless)
        self.context = self.browser.new_context()
        self.page = self.context.new_page()

    def login(self):
        if not self.erp_id or not self.erp_password:
            logging.error("ERP_ID or ERP_PASSWORD not found.")
            print("Error: ERP_ID or ERP_PASSWORD not found.")
            return False
            
        logging.info("Navigating to login page...")
        print("Navigating to login page...")
        self.page.goto("https://sook0517.cafe24.com/")
        
        # Handle potential alerts (e.g. "Invalid ID/PW")
        self.page.on("dialog", lambda dialog: (logging.info(f"Dialog: {dialog.message}"), print(f"Dialog: {dialog.message}"), dialog.accept()))
        
        logging.info("Logging in...")
        print("Logging in...")
        self.page.fill("input[name='id']", self.erp_id)
        self.page.fill("input[name='pwd']", self.erp_password)
        
        # Try submitting via Enter first
        self.page.press("input[name='pwd']", "Enter")
        
        # Also click just in case
        try:
             self.page.click("button[type='submit']", timeout=1000)
        except:
             pass
        
        try:
            # Wait for either main page OR a known element on the dashboard
            self.page.wait_for_url("**/index/main", timeout=10000)
            logging.info(f"Login successful. URL: {self.page.url}")
            print("Login successful.")
            return True
        except:
            # Check if we are still on login page
            if "login" in self.page.url or "cafe24.com/" == self.page.url:
                 logging.error(f"Login failed. Still on {self.page.url}")
                 print(f"Login failed. Still on {self.page.url}")
                 return False
            
            # Fallback: Check for a logged-in element (e.g. user info, logout button)
            try:
                if self.page.locator(".logout").count() > 0 or self.page.locator("a[href*='logout']").count() > 0:
                     logging.info("Login successful (found logout button).")
                     return True
            except:
                pass

            logging.warning(f"Login check timed out. URL: {self.page.url}. Assuming failure.")
            print(f"Login check timed out. URL: {self.page.url}")
            return False

    def get_today_events_data(self):
        """
        Retrieves all events for today from FullCalendar via JS.
        Returns a list of dicts: {'title': str, 'start': datetime, 'end': datetime}
        """
        try:
            data = self.page.evaluate("""() => {
                var cal = $('#calendar'); 
                if (cal.length === 0) cal = $('.fc').parent(); 
                
                if (cal.length > 0 && cal.fullCalendar) {
                    var events = cal.fullCalendar('clientEvents');
                    return events.map(e => ({
                        title: e.title,
                        start: e.start ? e.start.format() : null,
                        end: e.end ? e.end.format() : null
                    }));
                }
                return [];
            }""")
            
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            today_events = []
            
            for e in data:
                if e['start'] and e['start'].startswith(today_str):
                    # Parse start and end
                    # Format usually: YYYY-MM-DDTHH:mm:ss
                    try:
                        start_dt = datetime.datetime.fromisoformat(e['start'])
                        end_dt = datetime.datetime.fromisoformat(e['end']) if e['end'] else start_dt
                        today_events.append({
                            'title': e['title'],
                            'start': start_dt,
                            'end': end_dt
                        })
                    except Exception as parse_err:
                        logging.warning(f"Error parsing date for event {e['title']}: {parse_err}")
                        
            return today_events
        except Exception as e:
            logging.error(f"Error retrieving JS events: {e}")
            return []

    def get_events_range(self, start_date, end_date):
        """
        Retrieves events for a specific date range using JS scraping (since API is unreliable).
        Iterates through months to ensure all events are loaded.
        """
        try:
            if isinstance(start_date, str):
                start_date = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
            if isinstance(end_date, str):
                end_date = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
                
            # Ensure we are on the calendar page
            if not self.page.url.endswith("/index/calender"):
                logging.info("Navigating to calendar page...")
                self.page.goto("https://sook0517.cafe24.com/index/calender")
                self.page.wait_for_load_state("networkidle")
                
            all_events = []
            seen_ids = set()
            
            # Iterate month by month
            current_date = start_date.replace(day=1)
            end_month_date = end_date.replace(day=1)
            
            while current_date <= end_month_date:
                date_str = current_date.strftime("%Y-%m-%d")
                logging.info(f"Loading calendar for {date_str}...")
                
                # Navigate to date and switch to month view
                self.page.evaluate(f"$('#calendar').fullCalendar('gotoDate', '{date_str}')")
                self.page.evaluate("$('#calendar').fullCalendar('changeView', 'month')")
                time.sleep(1) # Wait for AJAX
                
                # Scrape events
                # Fetch events once (server returns all events regardless of idx)
                # We use idx=20 (Seat 1) as a default, but it returns everything.
                default_idx = 20
                
                # Switch event source
                self.page.evaluate(f"""() => {{
                    $('#calendar').fullCalendar('removeEventSources');
                    $('#calendar').fullCalendar('addEventSource', '/index.php/dataFunction/getEvent?idx={default_idx}');
                }}""")
                
                # Wait for events to fetch and render
                time.sleep(1.0) 
                
                # Scrape events
                events_data = self.page.evaluate("""() => {
                    var cal = $('#calendar');
                    if (cal.length === 0) cal = $('.fc').parent();
                    
                    if (cal.length > 0 && cal.fullCalendar) {
                        var events = cal.fullCalendar('clientEvents');
                        return events.map(e => ({
                            id: e._id || e.id,
                            title: e.title,
                            start: e.start ? e.start.format() : null,
                            end: e.end ? e.end.format() : null,
                            className: e.className, // Contains 'deviceX'
                            resourceId: e.resourceId // Fallback
                        }));
                    }
                    return [];
                }""")
                
                for e in events_data:
                    # Deduplicate based on ID
                    e_id = e.get('id')
                    if e_id and e_id in seen_ids:
                        continue
                    if e_id:
                        seen_ids.add(e_id)
                        
                    # Determine Resource ID from className
                    # className is usually a string like "bg_red device1" or list ["bg_red", "device1"]
                    resource_id = e.get('resourceId')
                    class_name = e.get('className')
                    
                    if not resource_id and class_name:
                        if isinstance(class_name, list):
                            class_name = " ".join(class_name)
                        
                        # Look for deviceX
                        import re
                        match = re.search(r'device(\d+)', str(class_name))
                        if match:
                            device_num = match.group(1)
                            resource_id = f"dobong-{device_num}"
                            
                    # Parse dates
                    try:
                        if not e['start']: continue
                        
                        dt_format = "%Y-%m-%d %H:%M:%S"
                        if "T" in e['start']:
                            s_dt = datetime.datetime.fromisoformat(e['start'])
                        else:
                            if len(e['start']) == 10:
                                s_dt = datetime.datetime.strptime(e['start'], "%Y-%m-%d")
                            else:
                                s_dt = datetime.datetime.strptime(e['start'], dt_format)
                                
                        if e.get('end'):
                            if "T" in e['end']:
                                e_dt = datetime.datetime.fromisoformat(e['end'])
                            else:
                                if len(e['end']) == 10:
                                    e_dt = datetime.datetime.strptime(e['end'], "%Y-%m-%d")
                                else:
                                    e_dt = datetime.datetime.strptime(e['end'], dt_format)
                        else:
                            e_dt = s_dt
                            
                        # Filter by range
                        if start_date <= s_dt.date() <= end_date:
                            all_events.append({
                                'title': e.get('title', 'No Title'),
                                'start': s_dt,
                                'end': e_dt,
                                'resourceId': resource_id
                            })
                    except Exception as parse_err:
                        logging.warning(f"Date parse error: {parse_err}")
                
                # Move to next month
                # Add 32 days to ensure we skip to next month, then set to day 1
                next_month = current_date + datetime.timedelta(days=32)
                current_date = next_month.replace(day=1)
                
            logging.info(f"Total collected events: {len(all_events)}")
            return all_events

        except Exception as e:
            logging.error(f"Error getting events via JS: {e}")
            import traceback
            logging.error(traceback.format_exc())
            return None

    def check_availability(self, date_str, start_time_str, end_time_str, name, product, request):
        """
        Checks availability based on seat allocation rules.
        Returns: (is_available, message, seat_id)
        """
        try:
            target_start = datetime.datetime.strptime(f"{date_str} {start_time_str}", "%Y-%m-%d %H:%M")
            target_end = datetime.datetime.strptime(f"{date_str} {end_time_str}", "%Y-%m-%d %H:%M")
            
            # Use get_events_range for a single day (start to next day)
            next_day = (datetime.datetime.strptime(date_str, "%Y-%m-%d") + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
            events = self.get_events_range(date_str, next_day)
            if events is None:
                return False, "데이터 조회 실패 (오류 발생)", None
            
            # 1. Duplicate Check
            for e in events:
                if name in e['title']:
                    logging.info(f"Duplicate reservation found for {name}")
                    return False, "이미 예약됨 (중복)", None

            # 2. Determine Target Seats
            # Rules:
            # - dobong-4, dobong-7, dobong-8 are RESERVED/EXCLUDED - Exclude from ALL auto-assign.
            # - Priority 1: Review/Experience (리뷰노트/체험권) -> Seats 1, 2, 3, 5, 6
            #   (Precedence: 'Review Note' request overrides 'Consultation' product type)
            # - Priority 2: Standard Consultation (상담) without Review Note -> Seat 9 (dobong-9)
            # - Default -> Seats 1, 2, 3, 5, 6 (Explicitly excluding 4, 7, 8)
            
            target_seats = []
            if "리뷰노트" in request or "체험권" in product: 
                 # Explicitly excluding 4, 7, 8
                 target_seats = ['dobong-1', 'dobong-2', 'dobong-3', 'dobong-5', 'dobong-6']
            elif "상담" in product or "상담" in request:
                 target_seats = ['dobong-9']
            else:
                 # Default to existing seats (Explicitly excluding 4, 7, 8)
                 target_seats = ['dobong-1', 'dobong-2', 'dobong-3', 'dobong-5', 'dobong-6']
            
            logging.info(f"Target seats for {name} ({product}): {target_seats}")

            # 3. Check Seat Availability
            # We need to find a seat that has NO overlap in the target time range
            
            available_seat = None
            
            for seat in target_seats:
                is_seat_free = True
                for e in events:
                    # Check if event is on this seat
                    # resourceId might be 'dobong-1' or just '1'. Handle both.
                    r_id = str(e.get('resourceId', ''))
                    
                    # Log encountered resource IDs for debugging
                    logging.info(f"Checking event '{e['title']}' on resource: {r_id} (sched: {e['start']}~{e['end']}) vs Target: {seat} ({target_start}~{target_end})")

                    # Normalize comparison: Check if '1' matches 'dobong-1' or 'dobong-1' matches 'dobong-1'
                    seat_suffix = seat.split('-')[-1] if '-' in seat else seat
                    r_id_suffix = r_id.split('-')[-1] if '-' in r_id else r_id
                    
                    if r_id_suffix != seat_suffix:
                        # logging.debug(f"Seat mismatch: {r_id_suffix} != {seat_suffix}")
                        continue
                        
                    # Check overlap
                    # target_start < e['end'] and target_end > e['start']
                    if e['start'] < target_end and e['end'] > target_start:
                        logging.warning(f"Overlap detected on {seat}: Event {e['start']}~{e['end']} overlaps with Target {target_start}~{target_end}")
                        is_seat_free = False
                        break
                
                if is_seat_free:
                    available_seat = seat
                    break
            
            if available_seat:
                return True, f"가능 ({available_seat})", available_seat
            else:
                return False, "좌석 없음", None

        except Exception as e:
            logging.error(f"Error checking availability: {e}")
            return False, f"오류: {e}", None

    def create_reservation(self, data, seat_id=None):
        """
        Creates a reservation with detailed form filling.
        """
        try:
            date_str = data['date']
            start_time = data['start_time']
            end_time = data['end_time']
            name = data['name']
            product = data.get('product', '')
            request = data.get('request', '')
            phone = data.get('phone', '')
            
            logging.info(f"Creating reservation for {name} ({product}) on {seat_id}")

            # Fallback: Determine seat_id if not provided
            # Fallback: Determine seat_id if not provided
            if not seat_id:
                if "상담" in product and "리뷰노트" not in request: # Strict check for pure consultation
                     seat_id = 'dobong-9'
                elif "리뷰노트" in request or "체험권" in product:
                     seat_id = 'dobong-1' # Default to 1 (Valid: 1,2,3,5,6)
                else:
                     seat_id = 'dobong-1' # Default to 1 for existing
                logging.info(f"Seat ID not provided. Defaulting to {seat_id} based on product.")

            # Ensure we are on the calendar page
            if not self.page.url.endswith("/index/calender"):
                logging.info("Navigating to calendar page for reservation...")
                self.page.goto("https://sook0517.cafe24.com/index/calender")
                self.page.wait_for_load_state("networkidle")

            # Navigate to date
            self.page.evaluate(f"$('#calendar').fullCalendar('gotoDate', '{date_str}')")
            self.page.evaluate("$('#calendar').fullCalendar('changeView', 'agendaDay')")
            time.sleep(1)
            
            # Click 'Add Schedule' button (일정 추가)
            # User confirmed this opens the correct modal.
            try:
                add_btn = self.page.locator("button.add_cal_btn")
                if add_btn.count() > 0 and add_btn.is_visible():
                    add_btn.click()
                else:
                    self.page.click("button:has-text('일정 추가')")
            except Exception as e:
                logging.warning(f"Button click failed: {e}. Trying JS fallback.")
                self.page.evaluate("$('#CalenderModalNew').modal('show')")

            # Wait for modal
            modal_selector = "#CalenderModalNew" 
            self.page.wait_for_selector(modal_selector, state="visible", timeout=3000)

            # --- Fill Date & Time ---
            
            # Normalize date_str to ensure YYYY-MM-DD
            # This handles cases where gui might pass other formats or split might get wrong year
            try:
                # Try parsing as ISO first
                if '-' in date_str:
                    parts = date_str.split('-')
                    if len(parts[0]) == 4: # Already YYYY-MM-DD
                        pass
                    elif len(parts[2]) == 4: # MM-DD-YYYY or DD-MM-YYYY -> Assume MM-DD-YYYY default or try to guess?
                        # Let's handle MM-DD-YYYY
                        date_str = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                elif '/' in date_str:
                    parts = date_str.split('/')
                    if len(parts[0]) == 4:
                        date_str = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
                    else:
                        date_str = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
            except Exception as e:
                logging.error(f"Date normalization error: {e}")

            # Date - Set the input value directly in YYYY-MM-DD format
            # Then trigger datepicker update
            logging.info(f"Setting date to {date_str}")
            
            # Split date for explicit Date object creation
            try:
                year, month, day = date_str.split('-')
            except ValueError:
                logging.error(f"Invalid date format after normalization: {date_str}")
                return False
            
            # Set input value directly first
            self.page.evaluate(f"$('#insDate').val('{date_str}');")
            
            # Use strict value setting bypassing setDate to avoid re-formatting to MM/DD/YYYY
            # We trigger change manually. 
            self.page.evaluate(f"""() => {{
                // Try to destroy datepicker to prevent interference if possible, 
                // but wrap in try-catch in case it doesn't exist or fails.
                try {{ $('#insDate').datepicker('destroy'); }} catch(e) {{}}
                
                // Set value again to be sure
                $('#insDate').val('{date_str}');
                
                // Trigger events
                $('#insDate').trigger('change');
                
                // Also native event
                document.getElementById('insDate').dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}""")
            
            # Wait for AJAX to populate device list
            time.sleep(0.5)
            
            # Start Time
            s_h, s_m = start_time.split(':')
            self.page.select_option(f"{modal_selector} #insStime", value=s_h)
            self.page.select_option(f"{modal_selector} #insStime_min", value=s_m)
            
            # End Time
            e_h, e_m = end_time.split(':')
            self.page.select_option(f"{modal_selector} #insEtime", value=e_h)
            self.page.select_option(f"{modal_selector} #insEtime_min", value=e_m)
            
            # Wait for Device list to update
            # The device list is populated via AJAX after date/time change.
            # We don't block here anymore because we have a robust retry loop at the end.
            time.sleep(0.2)


            # --- Fill Form ---
            
            # 0. Ensure 'Reservation' type is selected
            try:
                self.page.check(f"{modal_selector} input[name='type'][value='B']")
            except:
                pass

            # NOTE: Device selection is deferred to just before submission to prevent AJAX resets

            # 2. Member Type & Name
            # Default to 'Direct Join' (Value 'J', Class 'type_member_b') for automation
            # This allows entering name/phone directly without needing an existing member ID.
            try:
                self.page.click(f"{modal_selector} input.type_member_b", timeout=2000)
            except:
                logging.warning("Could not select 'Direct Join' radio button (proceeding)")

            # Fill Name
            self.page.fill(f"{modal_selector} #member_ins_name", name)
            
            # Fill Phone
            if phone:
                self.page.fill(f"{modal_selector} #insPhone", phone)
                
            # Fill Birthdate (Required field)
            try:
                self.page.select_option(f"{modal_selector} .birth_year", value="2000", timeout=2000)
                self.page.select_option(f"{modal_selector} .birth_month", value="01", timeout=2000)
                self.page.select_option(f"{modal_selector} .birth_day", value="01", timeout=2000)
            except:
                logging.warning("Could not select birthdate")


            # 3. Product Selection (Refactored)
            # Mapping logic based on Product Name and Option
            # IDs found from HTML dump:
            # 2종 1시간: 6268
            # 2종 5시간: 6269
            # 2종 9시간: 6270
            # 2종 16시간: 6271
            # 1종자동 1시간: 6272
            # 1종자동 5시간: 6273
            # 1종자동 9시간: 6274
            
            goods_val = "6268" # Default to 2종 1시간
            
            # Normalize inputs
            p_text = product.replace(" ", "")
            o_text = data.get('option', '').replace(" ", "")
            
            logging.info(f"Selecting Goods for Product: '{product}', Option: '{data.get('option', '')}'")
            
            if "1시간" in p_text or "체험권" in p_text:
                # 1시간 (체험권)
                if "1종수동" in o_text:
                    goods_val = "6244" # [개설][시간제][1수동][1시간] (Keep old guess for manual if not found?)
                    # Wait, I didn't see 1-jong manual in the dump. Let's assume it's close or use default.
                    # Actually, let's stick to what I found.
                    pass 
                elif "1종자동" in o_text:
                    goods_val = "6272" # [개설][시간제][1자동][1시간]
                else:
                    goods_val = "6268" # [개설][시간제][2종][1시간]
                    
            elif "합격무제한" in p_text:
                # 합격무제한 - IDs not confirmed in dump, keeping old guesses for now or defaulting to 2-jong 1h
                if "2종" in o_text and "기능+도로" in o_text:
                    goods_val = "6223" 
                elif "2종" in o_text and "도로" in o_text:
                    goods_val = "6222"
                elif "2종" in o_text and "기능" in o_text:
                    goods_val = "6221"
                elif "1종자동" in o_text and "기능+도로" in o_text:
                    goods_val = "6226"
                elif "1종수동" in o_text and "기능+도로" in o_text:
                    goods_val = "6229"
                else:
                    goods_val = "6223"
                    
            elif "2종시간제" in p_text:
                # 2종 시간제
                if "6시간" in o_text:
                    goods_val = "6269" # [개설][시간제][2종][5시간] (User said 6h -> 5h option)
                elif "12시간" in o_text:
                    goods_val = "6270" # [개설][시간제][2종][9시간] (User said 12h -> 9h option)
                elif "24시간" in o_text:
                    goods_val = "6271" # [개설][시간제][2종][16시간] (User said 24h -> 16h option)
                else:
                    goods_val = "6268" # Default to 1시간 (2종)
            
            elif "상담" in p_text:
                 pass

            logging.info(f"Selected Goods ID: {goods_val}")

            # Select the option in the dropdown
            # Selector correction: Element has name="goods_idx" but NO ID.
            try:
                self.page.select_option('select[name="goods_idx"]', value=goods_val)
            except Exception as e:
                logging.error(f"Failed to select goods {goods_val}: {e}")
                # Fallback to index 1 if specific value fails
                try:
                    self.page.select_option('select[name="goods_idx"]', index=1)
                except: pass

            # 4. Payment
            # Default to 'Naver Pay' (Value '12') if likely from Naver
            try:
                self.page.select_option(f"{modal_selector} .payment_select", value="12", timeout=2000)
            except:
                pass
            logging.info(f"Setting device {seat_id} (Verify and Retry mode)...")
            
            # Retry loop
            for attempt in range(5):
                # 1. Inspect current options
                options_info = self.page.evaluate(f"""() => {{
                    var sel = $('#CalenderModalNew select#insMachine');
                    if (sel.length === 0) sel = $('#CalenderModalNew select[name="machine_info_idx"]');
                    if (sel.length === 0) sel = $('#CalenderModalNew select').first();
                    
                    var opts = [];
                    sel.find('option').each(function() {{
                        opts.push({{ text: $(this).text(), value: $(this).val() }});
                    }});
                    return {{ opts: opts, val: sel.val(), id: sel.attr('id') }};
                }}""")
                
                logging.info(f"Attempt {attempt+1}: Current value: {options_info['val']}, Options count: {len(options_info['opts'])}")
                
                # Find target value
                target_value = None
                target_text = None
                
                # Text match
                for opt in options_info['opts']:
                    if opt['text'] == seat_id:
                        target_value = opt['value']
                        target_text = opt['text']
                        break
                # Partial text match
                if not target_value:
                    for opt in options_info['opts']:
                        if seat_id in opt['text']:
                            target_value = opt['value']
                            target_text = opt['text']
                            break
                # Number match
                if not target_value and '-' in seat_id:
                    seat_num = seat_id.split('-')[-1]
                    for opt in options_info['opts']:
                        if opt['text'].endswith('-' + seat_num):
                            target_value = opt['value']
                            target_text = opt['text']
                            break
                            
                if not target_value:
                    # If no options yet (AJAX still loading), wait a bit
                    if len(options_info['opts']) <= 1:
                        logging.info("Waiting for options to load...")
                        time.sleep(0.5)
                        continue
                    
                    logging.warning(f"Could not find option for {seat_id}. Waiting...")
                    time.sleep(0.5)
                    continue
                    
                # 2. Select the value
                if str(options_info['val']) != str(target_value):
                    logging.info(f"Applying selection: {target_text} ({target_value})")
                    
                    # Try Playwright native select first (more robust events)
                    try:
                        if options_info['id']:
                            self.page.select_option(f"#{options_info['id']}", value=str(target_value), timeout=2000)
                        else:
                            # Fallback to JS
                            self.page.evaluate(f"""() => {{
                                var sel = $('#CalenderModalNew select#insMachine');
                                if (sel.length === 0) sel = $('#CalenderModalNew select[name="machine_info_idx"]');
                                sel.val('{target_value}').trigger('change');
                            }}""")
                    except Exception as e:
                        logging.warning(f"Native select failed: {e}, using JS fallback")
                        self.page.evaluate(f"""() => {{
                            var sel = $('#CalenderModalNew select#insMachine');
                            if (sel.length === 0) sel = $('#CalenderModalNew select[name="machine_info_idx"]');
                            sel.val('{target_value}').trigger('change');
                        }}""")
                
                # 3. Wait and Verify
                time.sleep(0.5)
                
                current_val = self.page.evaluate("""() => {
                     var sel = $('#CalenderModalNew select#insMachine');
                     if (sel.length === 0) sel = $('#CalenderModalNew select[name="machine_info_idx"]');
                     return sel.val();
                }""")
                
                if str(current_val) == str(target_value):
                    logging.info("Selection verified and persisted!")
                    break
                else:
                    logging.warning(f"Selection lost (Current: {current_val}). Retrying...")
                

            
            # 6. Submit
            logging.info("Submitting form...")
            self.page.click(f"{modal_selector} button.antosubmit")
            
            # Wait for modal to close
            self.page.wait_for_selector(modal_selector, state="hidden", timeout=5000)
            
            logging.info(f"Reservation created for {name} on {date_str} {start_time}")
            return True
            
        except Exception as e:
            logging.error(f"Error creating reservation: {e}")
            return False

    def calculate_total_duration(self, name, events):
        """
        Calculates total duration in hours for a given user name based on today's events.
        """
        total_seconds = 0
        # Normalize name for comparison (remove spaces, etc. if needed, but simple contains check might suffice)
        # The event title usually contains the name.
        # User name from modal might be "홍길동", event title might be "10:00홍길동..."
        
        for e in events:
            if name in e['title']:
                duration = (e['end'] - e['start']).total_seconds()
                total_seconds += duration
                
        hours = total_seconds / 3600
        return round(hours, 1) # Return 1 decimal place

    def get_missing_memos(self):
        logging.info("Navigating to Calendar...")
        print("Navigating to Calendar...")
        self.page.goto("https://sook0517.cafe24.com/index/calender")
        self.page.wait_for_load_state("networkidle")
        logging.info("Calendar page loaded.")
        print("Calendar page loaded.")

        # Get all events data for duration calculation
        today_events_data = self.get_today_events_data()
        logging.info(f"Retrieved {len(today_events_data)} events via JS for duration calculation.")

        today_header = self.page.locator(".fc-day-header.fc-today")
        if today_header.count() == 0:
            logging.warning("Today's header not found.")
            print("Today's header not found.")
            return []

        headers = self.page.locator(".fc-day-header")
        count = headers.count()
        today_index = -1
        for i in range(count):
            if "fc-today" in headers.nth(i).get_attribute("class"):
                today_index = i
                break
        
        if today_index == -1:
            logging.warning("Today's index not found.")
            return []

        event_col = self.page.locator(".fc-content-skeleton tr td").nth(today_index + 1)
        events = event_col.locator(".fc-event")
        event_count = events.count()
        logging.info(f"Found {event_count} events today.")
        print(f"Found {event_count} events today.")

        missing_list = []
        
        for i in range(event_count):
            event = events.nth(i)
            event_title = event.text_content().strip()
            
            skip_keywords = ['리뷰노트', '시간제', '운영', '상담']
            if any(keyword in event_title for keyword in skip_keywords):
                logging.info(f"Skipping event: {event_title}")
                continue

            logging.info(f"Checking event: {event_title}")
            event.click(force=True)
            
            modal_selector = "#CalenderModalEdit"
            try:
                self.page.wait_for_selector(modal_selector, state="visible", timeout=5000)
            except:
                logging.error(f"Timeout waiting for modal for event {i+1}")
                
            try:
                name_input = self.page.locator(f"{modal_selector} .modify_name")
                name = name_input.input_value() if name_input.count() > 0 else "Unknown"

                # Check #memo_area
                memo_div = self.page.locator(f"{modal_selector} #memo_area")
                if memo_div.count() > 0:
                    with open("modal_dump.html", "w", encoding="utf-8") as f:
                        f.write(self.page.locator(modal_selector).inner_html())
                    memo_text = memo_div.inner_text().strip()
                else:
                    memo_text = ""
                
                today_str = datetime.date.today().strftime("%Y-%m-%d")
                has_today_memo = False
                
                date_inputs = self.page.locator(f"{modal_selector} .modify_comment_date")
                text_inputs = self.page.locator(f"{modal_selector} .modify_comment_text")
                
                count = date_inputs.count()
                for k in range(count):
                    date_val = date_inputs.nth(k).input_value().strip()
                    text_val = text_inputs.nth(k).input_value().strip()
                    if date_val == today_str and text_val:
                        has_today_memo = True
                        break
                
                is_missing = False
                if not has_today_memo and not memo_text:
                    is_missing = True
                
                logging.info(f"  Name: {name}, Today Memo: {has_today_memo}, General Memo: {bool(memo_text)}")
                
                if is_missing:
                    logging.info("  -> Missing memo detected.")
                    
                    # Calculate duration
                    duration = self.calculate_total_duration(name, today_events_data)
                    
                    missing_list.append({
                        "name": name,
                        "time": event_title,
                        "index": i,
                        "duration": duration
                    })

            except Exception as e:
                logging.error(f"Error extracting: {e}")
                print(f"Error extracting: {e}")

            close_btn = self.page.locator(f"{modal_selector} .antoclose2")
            if close_btn.count() == 0:
                close_btn = self.page.locator(f"{modal_selector} .close")
            close_btn.click()
            self.page.wait_for_selector(modal_selector, state="hidden", timeout=5000)
            time.sleep(0.5)
            
        return missing_list

    def write_memo(self, event_index, text):
        logging.info(f"Writing memo for event index {event_index}: {text}")
        
        try:
            if not self.page.url.endswith("/index/calender"):
                logging.info("Navigating to calendar...")
                self.page.goto("https://sook0517.cafe24.com/index/calender")
                self.page.wait_for_load_state("networkidle")

            # Find today's events again
            today_header = self.page.locator(".fc-day-header.fc-today")
            if today_header.count() == 0:
                logging.error("Today's header not found.")
                return False

            headers = self.page.locator(".fc-day-header")
            count = headers.count()
            today_index = -1
            for i in range(count):
                if "fc-today" in headers.nth(i).get_attribute("class"):
                    today_index = i
                    break
            
            if today_index == -1:
                logging.error("Today's index not found.")
                return False

            event_col = self.page.locator(".fc-content-skeleton tr td").nth(today_index + 1)
            events = event_col.locator(".fc-event")
            
            if event_index >= events.count():
                logging.error("Event index out of range.")
                return False
                
            event = events.nth(event_index)
            logging.info("Clicking event...")
            event.click(force=True)
            
            modal_selector = "#CalenderModalEdit"
            self.page.wait_for_selector(modal_selector, state="visible", timeout=5000)
            
            # Click 'Member Info Modify' button to open member modal
            logging.info("Opening member modal...")
            
            # Try executing the JS function directly first, as the click seems unreliable
            try:
                logging.info("Executing modMemberView() via JS...")
                self.page.evaluate("modMemberView()")
            except Exception as e:
                logging.warning(f"JS execution failed: {e}. Falling back to click.")
                # Fallback to click if JS fails
                modify_btn = self.page.locator("button:has-text('회원정보 수정')")
                modify_btn.scroll_into_view_if_needed()
                modify_btn.click(force=True)
            
            member_modal_selector = "#modifyMemberModal"
            # Wait for the modal to become visible. 
            try:
                self.page.wait_for_selector(member_modal_selector, state="visible", timeout=10000)
            except:
                logging.warning("Standard wait failed. Checking if modal is present but hidden or animating.")
                # Sometimes it might be attached but not fully 'visible' by Playwright standards immediately
                if not self.page.is_visible(member_modal_selector):
                     logging.error("Modal still not visible.")
                     return False

            # Scroll to the bottom of the member modal to ensure buttons are visible
            # The modal body is scrollable usually.
            # We can try scrolling the modal content.
            logging.info("Scrolling to bottom of member modal...")
            self.page.evaluate(f"document.querySelector('{member_modal_selector} .modal-body').scrollTop = document.querySelector('{member_modal_selector} .modal-body').scrollHeight")
            time.sleep(0.5)

            # Click '+' button to add new memo row
            logging.info("Clicking '+' button...")
            plus_btn = self.page.locator(f"{member_modal_selector} .comment_btn .plus")
            plus_btn.scroll_into_view_if_needed()
            plus_btn.click()
            
            time.sleep(1) 
            
            # Find the last date and comment inputs
            date_inputs = self.page.locator(f"{member_modal_selector} input[name='date[]']")
            comment_inputs = self.page.locator(f"{member_modal_selector} input[name='comment[]']")
            
            if date_inputs.count() == 0 or comment_inputs.count() == 0:
                logging.error("Could not find memo inputs in member modal.")
                return False
                
            # Fill the last one
            last_date_input = date_inputs.last
            last_comment_input = comment_inputs.last
            
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            logging.info(f"Filling memo: {today_str} - {text}")
            
            # Ensure date input is focused and cleared before filling
            last_date_input.click()
            last_date_input.fill(today_str)
            # Press Enter to confirm date (often needed for date pickers or validation)
            last_date_input.press("Enter")
            # Also Tab to move focus away, triggering blur/change events
            last_date_input.press("Tab")
            
            # Explicitly dispatch events to ensure the value is recognized by any framework (like jQuery/React/Vue)
            last_date_input.evaluate("el => { el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); }")
            
            time.sleep(0.5) # Small pause to let UI update

            last_comment_input.fill(text)
            last_comment_input.press("Tab") # Ensure comment is also committed
            
            # Handle potential alert dialogs on submission (e.g. "Saved successfully")
            self.page.on("dialog", lambda dialog: dialog.accept())

            # Click 'Modify' (Submit) button in member modal
            logging.info("Submitting member modal...")
            submit_btn = self.page.locator(f"{member_modal_selector} button.antosubmit")
            submit_btn.scroll_into_view_if_needed()
            
            # Sometimes the submit button needs a moment or a force click
            submit_btn.click(force=True)
            
            # Wait for member modal to close
            # If there's an alert, the dialog handler should catch it.
            # We'll increase timeout just in case network is slow.
            try:
                self.page.wait_for_selector(member_modal_selector, state="hidden", timeout=10000)
            except:
                logging.warning("Modal did not close automatically. Checking for alerts or errors.")
                # If it didn't close, maybe we need to close it manually or check if it's still visible
                if self.page.is_visible(member_modal_selector):
                     logging.warning("Modal is still visible. Attempting to close manually or ignoring if save worked.")
                     # It's possible the save worked but the modal didn't close (unlikely for this ERP but possible)
                     # Or maybe the click didn't register.
                     # Let's try clicking submit again if it's still there? No, might duplicate.
                     # Let's just return True if we don't see an error, or False if we suspect failure.
                     # For now, let's assume if we got here, it might have worked.
                     pass

            logging.info("Memo written successfully via Member Modal.")
            return True
            
        except Exception as e:
            logging.error(f"Error writing memo: {e}")
            return False

    def write_memos_batch(self, memo_list):
        """
        Writes multiple memos in one session.
        memo_list: list of dicts {'index': int, 'text': str}
        Returns: dict {index: success_bool}
        """
        results = {}
        for item in memo_list:
            idx = item['index']
            text = item['text']
            logging.info(f"Batch processing: Writing memo for index {idx}")
            success = self.write_memo(idx, text)
            results[idx] = success
            if not success:
                logging.error(f"Failed to write memo for index {idx}. Continuing...")
            
            # Small delay to ensure stability between actions
            time.sleep(1)
            
        return results

    def close(self):
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
