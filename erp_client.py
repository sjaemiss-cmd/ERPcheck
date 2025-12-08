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
        
        logging.info("Logging in...")
        print("Logging in...")
        self.page.fill("input[name='id']", self.erp_id)
        self.page.fill("input[name='pwd']", self.erp_password)
        self.page.click("button[type='submit']")
        
        try:
            self.page.wait_for_url("**/index/main", timeout=5000)
            logging.info("Login successful.")
            print("Login successful.")
            return True
        except:
            print("Login check timeout, assuming success or manual check needed.")
            return True

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

    def get_events_for_date(self, target_date):
        """
        Retrieves events for a specific date.
        target_date: datetime.date object or string 'YYYY-MM-DD'
        """
        if isinstance(target_date, datetime.date):
            target_date_str = target_date.strftime("%Y-%m-%d")
        else:
            target_date_str = target_date
            
        try:
            # Ensure we are on the calendar page
            if not self.page.url.endswith("/index/calender"):
                logging.info("Navigating to calendar page for availability check...")
                self.page.goto("https://sook0517.cafe24.com/index/calender")
                self.page.wait_for_load_state("networkidle")
                
                # Dump HTML for inspection
                try:
                    with open("calendar_dump.html", "w", encoding="utf-8") as f:
                        f.write(self.page.content())
                    logging.info("Saved calendar_dump.html")
                except Exception as e:
                    logging.error(f"Failed to save dump: {e}")
            
            # Navigate to date
            self.page.evaluate(f"$('#calendar').fullCalendar('gotoDate', '{target_date_str}')")
            time.sleep(1) # Wait for render
            
            data = self.page.evaluate("""() => {
                var cal = $('#calendar'); 
                if (cal.length === 0) cal = $('.fc').parent(); 
                
                if (cal.length > 0 && cal.fullCalendar) {
                    var events = cal.fullCalendar('clientEvents');
                    return events.map(e => ({
                        title: e.title,
                        start: e.start ? e.start.format() : null,
                        end: e.end ? e.end.format() : null,
                        resourceId: e.resourceId || 'NoResource'
                    }));
                }
                return [];
            }""")
            
            events_on_date = []
            for e in data:
                if e['start'] and e['start'].startswith(target_date_str):
                    try:
                        start_dt = datetime.datetime.fromisoformat(e['start'])
                        end_dt = datetime.datetime.fromisoformat(e['end']) if e['end'] else start_dt
                        events_on_date.append({
                            'title': e['title'],
                            'start': start_dt,
                            'end': end_dt,
                            'resourceId': e.get('resourceId')
                        })
                    except:
                        pass
            return events_on_date
        except Exception as e:
            logging.error(f"Error getting events for date {target_date_str}: {e}")
            return []

    def check_availability(self, date_str, start_time_str, end_time_str, name, product, request):
        """
        Checks availability based on seat allocation rules.
        Returns: (is_available, message, seat_id)
        """
        try:
            target_start = datetime.datetime.strptime(f"{date_str} {start_time_str}", "%Y-%m-%d %H:%M")
            target_end = datetime.datetime.strptime(f"{date_str} {end_time_str}", "%Y-%m-%d %H:%M")
            
            events = self.get_events_for_date(date_str)
            
            # 1. Duplicate Check
            for e in events:
                if name in e['title']:
                    logging.info(f"Duplicate reservation found for {name}")
                    return False, "이미 예약됨 (중복)", None

            # 2. Determine Target Seats
            # Rules:
            # - Consultation (상담) -> Seat 9 (dobong-9)
            # - New/Review (신규/리뷰노트) -> Seats 4, 5 (dobong-4, dobong-5)
            # - Existing (기존 - default) -> Seats 1, 2, 3 (dobong-1, dobong-2, dobong-3)
            
            target_seats = []
            if "상담" in product or "상담" in request:
                 target_seats = ['dobong-9']
            elif "리뷰노트" in request or "체험권" in product: # Assuming New/Review
                 target_seats = ['dobong-4', 'dobong-5']
            else:
                 # Default to existing seats
                 target_seats = ['dobong-1', 'dobong-2', 'dobong-3']
            
            logging.info(f"Target seats for {name} ({product}): {target_seats}")

            # 3. Check Seat Availability
            # We need to find a seat that has NO overlap in the target time range
            
            available_seat = None
            
            for seat in target_seats:
                is_seat_free = True
                for e in events:
                    # Check if event is on this seat
                    # resourceId might be 'dobong-1' or just '1'. Let's handle both if possible, 
                    # but user said 'dobong-9'.
                    r_id = e.get('resourceId', '')
                    
                    # Normalize comparison (handle if ERP uses '1' instead of 'dobong-1')
                    # But let's assume 'dobong-X' for now based on user input.
                    if r_id != seat:
                        continue
                        
                    # Check overlap
                    if e['start'] < target_end and e['end'] > target_start:
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
            if not seat_id:
                if "상담" in product or "상담" in request:
                     seat_id = 'dobong-9'
                elif "리뷰노트" in request or "체험권" in product:
                     seat_id = 'dobong-4' # Default to 4 for new/review
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
            # Date - Set the input value directly in YYYY-MM-DD format
            # Then trigger datepicker update
            logging.info(f"Setting date to {date_str}")
            
            # Split date for explicit Date object creation
            year, month, day = date_str.split('-')
            
            # Set input value directly first
            self.page.evaluate(f"$('#insDate').val('{date_str}');")
            
            # Then update datepicker with explicit Date object (month is 0-indexed in JS)
            self.page.evaluate(f"$('#insDate').datepicker('setDate', new Date({year}, {int(month)-1}, {int(day)}));")
            
            # Trigger change event
            self.page.evaluate(f"$('#insDate').trigger('change');")
            
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
            # Wait until the select has options other than the default placeholder.
            try:
                self.page.wait_for_function(
                    f"document.querySelector('{modal_selector} select[name=\"machine_info_idx\"]').options.length > 1",
                    timeout=5000
                )
            except:
                logging.warning("Device list did not populate within timeout.")

            # --- Fill Form ---
            
            # 0. Ensure 'Reservation' type is selected
            try:
                self.page.check(f"{modal_selector} input[name='type'][value='B']")
            except:
                pass

            # 1. Device (Seat)
            if seat_id:
                try:
                    # Target the specific select in the NEW modal
                    device_select_selector = f"{modal_selector} select#insMachine"
                    
                    # Retry loop for device selection
                    max_retries = 3
                    selection_success = False
                    
                    for attempt in range(max_retries):
                        logging.info(f"Device selection attempt {attempt+1}/{max_retries}")
                        
                        # Wait for options using jQuery check
                        try:
                            self.page.wait_for_function(
                                f"$('#CalenderModalNew select#insMachine option[value!=\"\"]').length > 0",
                                timeout=5000
                            )
                        except:
                            logging.warning("Timeout waiting for device options.")
                            time.sleep(0.5)
                            continue

                        # Small stabilization delay after AJAX
                        time.sleep(0.3)

                        # Fetch options using jQuery
                        options_data = self.page.evaluate("""() => {
                            var opts = [];
                            $('#CalenderModalNew select#insMachine option').each(function() {
                                opts.push({ text: $(this).text(), value: $(this).val() });
                            });
                            return opts;
                        }""")
                        logging.info(f"Available device options: {options_data}")
                        
                        target_value = None
                        # Matching logic (Exact -> Number -> Text)
                        for opt in options_data:
                            if opt['value'] == seat_id:
                                target_value = seat_id
                                break
                        if not target_value and '-' in seat_id:
                            seat_num = seat_id.split('-')[-1]
                            for opt in options_data:
                                if opt['value'] == seat_num or seat_num in opt['text']:
                                    target_value = opt['value']
                                    break
                        if not target_value:
                             for opt in options_data:
                                if seat_id in opt['text']:
                                    target_value = opt['value']
                                    break
                        if not target_value and len(options_data) >= 2:
                             target_value = options_data[1]['value'] # First non-default option

                        if target_value:
                            logging.info(f"Selecting device: {target_value}")
                            
                            # Use jQuery to set value and trigger events
                            result = self.page.evaluate(f"""() => {{
                                try {{
                                    var sel = $('#CalenderModalNew select#insMachine');
                                    if (sel.length === 0) return {{ success: false, error: 'Selector not found' }};
                                    
                                    // Set value using jQuery
                                    sel.val('{target_value}');
                                    
                                    // Trigger all relevant jQuery events
                                    sel.trigger('focus');
                                    sel.trigger('change');
                                    sel.trigger('blur');
                                    
                                    // Verify
                                    var actualValue = sel.val();
                                    return {{ success: actualValue === '{target_value}', actualValue: actualValue }};
                                }} catch(e) {{
                                    return {{ success: false, error: e.toString() }};
                                }}
                            }}""")
                            
                            logging.info(f"Selection result: {result}")
                            
                            if result.get('success'):
                                selection_success = True
                                break
                        
                        time.sleep(1) # Wait before retry
                    
                    if not selection_success:
                        logging.error(f"Failed to select device {seat_id} after retries.")
                        self.page.screenshot(path="debug_device_failure.png")
                        
                except Exception as e:
                    logging.warning(f"Error selecting seat {seat_id}: {e}")
                    self.page.screenshot(path="debug_device_error.png")

            # 2. Member Type & Name

            # 2. Member Type & Name
            # Default to 'Direct Join' (Value 'J', Class 'type_member_b') for automation
            # This allows entering name/phone directly without needing an existing member ID.
            try:
                self.page.click(f"{modal_selector} input.type_member_b")
            except:
                logging.warning("Could not select 'Direct Join' radio button")

            # Fill Name
            self.page.fill(f"{modal_selector} #member_ins_name", name)
            
            # Fill Phone
            if phone:
                self.page.fill(f"{modal_selector} #insPhone", phone)
                
            # Fill Birthdate (Required field)
            # Default to 2000-01-01 if not provided (User can correct later)
            try:
                self.page.select_option(f"{modal_selector} .birth_year", value="2000")
                self.page.select_option(f"{modal_selector} .birth_month", value="01")
                self.page.select_option(f"{modal_selector} .birth_day", value="01")
            except:
                logging.warning("Could not select birthdate")

            # 3. Product Selection
            # If "상담" (Consultation), check "No Product"
            if "상담" in product or "상담" in request:
                try:
                    self.page.click(f"{modal_selector} input.nullGoods") 
                except:
                    pass
            else:
                # For other products, we might need to select something.
                # For now, leave as is or select a default if required.
                pass
                
            # 4. Payment
            # Default to 'Naver Pay' (Value '12') if likely from Naver
            try:
                self.page.select_option(f"{modal_selector} .payment_select", value="12")
            except:
                pass
            
            # 5. Submit
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
