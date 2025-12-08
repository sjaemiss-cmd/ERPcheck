import sys
import schedule
import time
import threading
import datetime
import winreg
from PyQt6.QtCore import QTimer, pyqtSignal, QObject, Qt, QSettings, QEvent
from PyQt6.QtWidgets import (QApplication, QSystemTrayIcon, QMenu, QMessageBox, 
                             QMainWindow, QVBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QListWidget, QWidget, QCheckBox, QHBoxLayout, QProgressDialog,
                             QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView)
from PyQt6.QtGui import QIcon, QAction, QCloseEvent
from erp_client import ERPClient
from naver_client import NaverClient
from kakao_client import KakaoClient
from kakao_client import KakaoClient
import logging
import re
import datetime

# Setup logging (redundant if imported from erp_client but good for safety)
# erp_client sets it up globally, so we just use logging.

class Worker(QObject):
    finished = pyqtSignal(list)
    
    def __init__(self, headless=True, erp_id=None, erp_password=None):
        super().__init__()
        self.headless = headless
        self.erp_id = erp_id
        self.erp_password = erp_password

    def run(self):
        logging.info(f"Worker: Starting check (Headless={self.headless})...")
        print(f"Worker: Starting check (Headless={self.headless})...")
        client = ERPClient(headless=self.headless, erp_id=self.erp_id, erp_password=self.erp_password)
        try:
            client.start()
            if client.login():
                missing = client.get_missing_memos()
                logging.info(f"Worker: Found {len(missing)} missing memos.")
                self.finished.emit(missing)
            else:
                logging.error("Worker: Login failed.")
                self.finished.emit([])
            client.close()
        except Exception as e:
            logging.error(f"Worker Error: {e}")
            print(f"Worker Error: {e}")
            self.finished.emit([])

class BatchMemoWriter(QObject):
    finished = pyqtSignal(dict)
    
    def __init__(self, memo_list, headless=True, erp_id=None, erp_password=None):
        super().__init__()
        self.memo_list = memo_list
        self.headless = headless
        self.erp_id = erp_id
        self.erp_password = erp_password
        
    def run(self):
        logging.info(f"BatchWriter: Writing {len(self.memo_list)} memos...")
        client = ERPClient(headless=self.headless, erp_id=self.erp_id, erp_password=self.erp_password)
        try:
            client.start()
            if client.login():
                results = client.write_memos_batch(self.memo_list)
                logging.info(f"BatchWriter: Results={results}")
                self.finished.emit(results)
            else:
                logging.error("BatchWriter: Login failed.")
                self.finished.emit({})
            client.close()
        except Exception as e:
            logging.error(f"BatchWriter Error: {e}")
            self.finished.emit({})

class MissingMemoWidget(QWidget):
    notification_requested = pyqtSignal(str, str) # title, message
    window_requested = pyqtSignal()

    def __init__(self):
        super().__init__()
        self.layout = QVBoxLayout(self)
        
        # Login fields
        login_layout = QHBoxLayout()
        self.input_id = QLineEdit()
        self.input_id.setPlaceholderText("아이디")
        self.input_pw = QLineEdit()
        self.input_pw.setPlaceholderText("비밀번호")
        self.input_pw.setEchoMode(QLineEdit.EchoMode.Password)
        
        login_layout.addWidget(QLabel("ID:"))
        login_layout.addWidget(self.input_id)
        login_layout.addWidget(QLabel("PW:"))
        login_layout.addWidget(self.input_pw)
        self.layout.addLayout(login_layout)

        top_layout = QHBoxLayout()
        self.btn_check = QPushButton("지금 확인")
        self.btn_check.clicked.connect(self.run_check)
        top_layout.addWidget(self.btn_check)
        
        self.chk_browser = QCheckBox("브라우저 표시")
        top_layout.addWidget(self.chk_browser)
        
        self.chk_startup = QCheckBox("시작 시 자동 실행")
        self.chk_startup.clicked.connect(self.toggle_startup)
        top_layout.addWidget(self.chk_startup)
        
        self.layout.addLayout(top_layout)
        
        # Status
        self.lbl_status = QLabel("대기 중")
        self.layout.addWidget(self.lbl_status)
        
        # List
        self.list_widget = QListWidget()
        self.list_widget.setSelectionMode(QListWidget.SelectionMode.ExtendedSelection)
        self.list_widget.itemClicked.connect(self.on_item_clicked)
        self.layout.addWidget(self.list_widget)

        # List control buttons
        list_btn_layout = QHBoxLayout()
        self.btn_delete_selected = QPushButton("선택 삭제")
        self.btn_delete_selected.clicked.connect(self.delete_selected_items)
        list_btn_layout.addWidget(self.btn_delete_selected)
        
        self.btn_delete_all = QPushButton("전체 삭제")
        self.btn_delete_all.clicked.connect(self.delete_all_items)
        list_btn_layout.addWidget(self.btn_delete_all)
        
        self.layout.addLayout(list_btn_layout)
        
        # Input area
        self.layout.addWidget(QLabel("메모 내용:"))
        self.input_memo = QLineEdit()
        self.input_memo.setPlaceholderText("사용자를 선택하고 메모를 입력하세요...")
        self.layout.addWidget(self.input_memo)
        
        # Buttons layout
        btn_layout = QHBoxLayout()
        
        self.btn_save_draft = QPushButton("임시 저장")
        self.btn_save_draft.clicked.connect(self.save_draft)
        btn_layout.addWidget(self.btn_save_draft)
        
        self.btn_send_all = QPushButton("일괄 전송")
        self.btn_send_all.clicked.connect(self.send_all_memos)
        self.btn_send_all.setEnabled(False) # Disabled initially
        btn_layout.addWidget(self.btn_send_all)
        
        self.layout.addLayout(btn_layout)
        
        # Scheduler
        self.timer = QTimer()
        self.timer.timeout.connect(self.check_schedule)
        self.timer.start(60000) # Check every minute
        # Weekdays at 20:00
        schedule.every().monday.at("20:00").do(self.scheduled_check)
        schedule.every().tuesday.at("20:00").do(self.scheduled_check)
        schedule.every().wednesday.at("20:00").do(self.scheduled_check)
        schedule.every().thursday.at("20:00").do(self.scheduled_check)
        schedule.every().friday.at("20:00").do(self.scheduled_check)
        
        # Weekends at 17:00
        schedule.every().saturday.at("17:00").do(self.scheduled_check)
        schedule.every().sunday.at("17:00").do(self.scheduled_check)
        
        # Check startup status
        self.check_startup_status()
        
        self.missing_list = []
        self.drafts = {} # {index: text}
        self.worker_thread = None
        self.writer_thread = None
        
        # Load settings
        self.settings = QSettings("MyCompany", "ERPCheck")
        self.load_settings()

    def load_settings(self):
        saved_id = self.settings.value("erp_id", "")
        saved_pw = self.settings.value("erp_password", "")
        if saved_id:
            self.input_id.setText(saved_id)
        if saved_pw:
            self.input_pw.setText(saved_pw)

    def save_settings(self):
        self.settings.setValue("erp_id", self.input_id.text())
        self.settings.setValue("erp_password", self.input_pw.text())

    def show_loading(self, message):
        self.progress_dialog = QProgressDialog(message, None, 0, 0, self)
        self.progress_dialog.setWindowTitle("처리 중")
        self.progress_dialog.setWindowModality(Qt.WindowModality.WindowModal)
        self.progress_dialog.setCancelButton(None)
        self.progress_dialog.show()

    def hide_loading(self):
        if hasattr(self, 'progress_dialog') and self.progress_dialog:
            self.progress_dialog.close()

    def check_schedule(self):
        schedule.run_pending()

    def scheduled_check(self):
        self.run_check()

    def run_check(self):
        self.lbl_status.setText("확인 중...")
        self.btn_check.setEnabled(False)
        self.list_widget.clear()
        self.drafts = {} # Clear drafts on new check
        self.btn_send_all.setEnabled(False)
        self.input_memo.clear()
        
        self.save_settings()
        
        # Show loading
        self.show_loading("확인 중입니다...")

        headless = not self.chk_browser.isChecked()
        erp_id = self.input_id.text()
        erp_password = self.input_pw.text()
        
        self.worker = Worker(headless=headless, erp_id=erp_id, erp_password=erp_password)
        self.worker.finished.connect(self.on_check_finished)
        
        self.worker_thread = threading.Thread(target=self.worker.run)
        self.worker_thread.start()

    def on_check_finished(self, missing_list):
        self.hide_loading()
        self.btn_check.setEnabled(True)
        self.missing_list = missing_list
        self.list_widget.clear()
        
        if missing_list:
            self.lbl_status.setText(f"{len(missing_list)}명의 누락된 메모를 찾았습니다.")
            self.notification_requested.emit(f"{len(missing_list)}명의 누락된 메모를 찾았습니다!", "warning")
            self.window_requested.emit() # Pop up
            for item in missing_list:
                duration_str = f" ({item.get('duration', 0)}시간)" if item.get('duration') else ""
                self.list_widget.addItem(f"{item['name']}{duration_str} - {item['time']}")
        else:
            self.lbl_status.setText("누락된 메모가 없습니다.")
            self.notification_requested.emit("누락된 메모가 없습니다.", "info")

    def on_item_clicked(self, item):
        row = self.list_widget.row(item)
        if row >= 0 and row < len(self.missing_list):
            missing_item = self.missing_list[row]
            idx = missing_item['index']
            # Load draft if exists
            if idx in self.drafts:
                self.input_memo.setText(self.drafts[idx])
            else:
                self.input_memo.clear()

    def save_draft(self):
        row = self.list_widget.currentRow()
        if row < 0:
            QMessageBox.warning(self, "경고", "사용자를 선택해주세요.")
            return
            
        text = self.input_memo.text()
        if not text:
            QMessageBox.warning(self, "경고", "메모 내용을 입력해주세요.")
            return
            
        item = self.missing_list[row]
        idx = item['index']
        self.drafts[idx] = text
        
        # Update list item text
        list_item = self.list_widget.item(row)
        duration_str = f" ({item.get('duration', 0)}시간)" if item.get('duration') else ""
        original_text = f"{item['name']}{duration_str} - {item['time']}"
        list_item.setText(f"[저장됨] {original_text}")
        
        self.lbl_status.setText(f"{item['name']}님의 메모가 임시 저장되었습니다.")
        self.btn_send_all.setEnabled(True)

    def send_all_memos(self):
        if not self.drafts:
            QMessageBox.warning(self, "경고", "전송할 메모가 없습니다.")
            return
            
        confirm = QMessageBox.question(self, "확인", f"{len(self.drafts)}개의 메모를 전송하시겠습니까?", QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if confirm == QMessageBox.StandardButton.No:
            return

        self.lbl_status.setText("메모 전송 중...")
        self.btn_send_all.setEnabled(False)
        self.btn_save_draft.setEnabled(False)
        
        self.save_settings()
        
        # Show loading
        self.show_loading("전송 중입니다...")

        # Prepare list for batch writer
        memo_list = []
        for idx, text in self.drafts.items():
            memo_list.append({'index': idx, 'text': text})
            
        headless = not self.chk_browser.isChecked()
        erp_id = self.input_id.text()
        erp_password = self.input_pw.text()
        
        self.batch_writer = BatchMemoWriter(memo_list, headless=headless, erp_id=erp_id, erp_password=erp_password)
        self.batch_writer.finished.connect(self.on_batch_finished)
        
        self.writer_thread = threading.Thread(target=self.batch_writer.run)
        self.writer_thread.start()

    def on_batch_finished(self, results):
        self.hide_loading()
        self.btn_send_all.setEnabled(True)
        self.btn_save_draft.setEnabled(True)
        
        success_count = sum(1 for res in results.values() if res)
        total_count = len(results)
        
        if success_count == total_count:
            self.lbl_status.setText("모든 메모가 성공적으로 전송되었습니다.")
            QMessageBox.information(self, "성공", "모든 메모가 성공적으로 전송되었습니다.")
            
            # Remove successful items from list and drafts
            for i in range(self.list_widget.count() - 1, -1, -1):
                if i < len(self.missing_list):
                    item = self.missing_list[i]
                    idx = item['index']
                    if idx in results and results[idx]:
                        self.list_widget.takeItem(i)
                        self.missing_list.pop(i)
                        if idx in self.drafts:
                            del self.drafts[idx]
            
            self.input_memo.clear()
            if not self.missing_list:
                self.btn_send_all.setEnabled(False)
                
        else:
            self.lbl_status.setText(f"{success_count}/{total_count} 메모 전송 완료.")
            QMessageBox.warning(self, "부분 성공", f"{success_count}/{total_count} 메모만 전송되었습니다. 로그를 확인해주세요.")
            
            # Remove successful ones
            for i in range(self.list_widget.count() - 1, -1, -1):
                if i < len(self.missing_list):
                    item = self.missing_list[i]
                    idx = item['index']
                    if idx in results and results[idx]:
                        self.list_widget.takeItem(i)
                        self.missing_list.pop(i)
                        if idx in self.drafts:
                            del self.drafts[idx]

    def delete_selected_items(self):
        selected_items = self.list_widget.selectedItems()
        if not selected_items:
            return
            
        # Sort rows in descending order to delete correctly
        rows = sorted([self.list_widget.row(item) for item in selected_items], reverse=True)
        
        for row in rows:
            # Remove from missing_list
            if row < len(self.missing_list):
                item = self.missing_list[row]
                idx = item['index']
                
                # Remove from drafts if exists
                if idx in self.drafts:
                    del self.drafts[idx]
                
                self.missing_list.pop(row)
                
            # Remove from list_widget
            self.list_widget.takeItem(row)
            
        self.input_memo.clear()
        self.lbl_status.setText(f"{len(rows)}개의 항목이 삭제되었습니다.")
        
        if not self.missing_list:
            self.btn_send_all.setEnabled(False)

    def delete_all_items(self):
        if not self.missing_list:
            return
            
        confirm = QMessageBox.question(self, "확인", "모든 항목을 목록에서 삭제하시겠습니까?", QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if confirm == QMessageBox.StandardButton.No:
            return
            
        self.list_widget.clear()
        self.missing_list = []
        self.drafts = {}
        self.input_memo.clear()
        self.btn_send_all.setEnabled(False)
        self.lbl_status.setText("모든 항목이 삭제되었습니다.")

    def check_startup_status(self):
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "교육일지마스터"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
            winreg.QueryValueEx(key, app_name)
            winreg.CloseKey(key)
            self.chk_startup.setChecked(True)
        except FileNotFoundError:
            self.chk_startup.setChecked(False)
        except Exception:
            self.chk_startup.setChecked(False)

    def toggle_startup(self):
        enable = self.chk_startup.isChecked()
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "교육일지마스터"
        
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
        else:
            exe_path = sys.argv[0] 
            
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS)
            if enable:
                winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, exe_path)
                print(f"Added to startup: {exe_path}")
            else:
                try:
                    winreg.DeleteValue(key, app_name)
                    print("Removed from startup.")
                except FileNotFoundError:
                    pass
            winreg.CloseKey(key)
        except Exception as e:
            print(f"Error setting startup: {e}")
            QMessageBox.warning(self, "Startup Error", str(e))
            self.chk_startup.setChecked(not enable) 

class NaverWorker(QObject):
    finished = pyqtSignal(list)
    login_finished = pyqtSignal(bool)
    
    def __init__(self, mode="collect"):
        super().__init__()
        self.mode = mode
        self.client = NaverClient(headless=True)

    def run(self):
        if self.mode == "login":
            result = self.client.login()
            self.login_finished.emit(result)
        elif self.mode == "collect":
            data = self.client.get_reservations()
            self.finished.emit(data)

class KakaoWorker(QObject):
    finished = pyqtSignal(list)
    login_finished = pyqtSignal(bool)
    
    def __init__(self, mode="collect"):
        super().__init__()
        self.mode = mode
        self.client = KakaoClient(headless=True)

    def run(self):
        if self.mode == "login":
            result = self.client.login()
            self.login_finished.emit(result)
        elif self.mode == "collect":
            data = self.client.get_chats()
            self.finished.emit(data)

class ERPWorker(QObject):
    finished = pyqtSignal(str) # Message
    progress = pyqtSignal(int, int) # current, total
    status_update = pyqtSignal(int, str, str) # row_index, status_text, color
    
    def __init__(self, mode, data, erp_creds=None):
        super().__init__()
        self.mode = mode # 'check' or 'register'
        self.data = data # List of dicts with row_index and reservation info
        self.erp_creds = erp_creds

    def run(self):
        erp_id = self.erp_creds.get('id') if self.erp_creds else None
        erp_password = self.erp_creds.get('password') if self.erp_creds else None
        client = ERPClient(headless=False, erp_id=erp_id, erp_password=erp_password) # Show browser for visibility
        try:
            client.start()
            if not client.login():
                self.finished.emit("ERP 로그인 실패")
                return

            total = len(self.data)
            for i, item in enumerate(self.data):
                row_idx = item['row_index']
                res_data = item['data']
                
                if self.mode == 'check':
                    # Pass extra info for seat logic
                    is_available, msg, seat_id = client.check_availability(
                        res_data['date'], 
                        res_data['start_time'], 
                        res_data['end_time'],
                        res_data['name'],
                        res_data.get('product', ''),
                        res_data.get('request', '')
                    )
                    
                    # Store seat_id in data for registration
                    if seat_id:
                        self.data[i]['data']['seat_id'] = seat_id
                        
                    if is_available:
                        self.status_update.emit(row_idx, msg, "green")
                    else:
                        color = "orange" if "중복" in msg else "red"
                        self.status_update.emit(row_idx, msg, color)
                
                elif self.mode == 'register':
                    seat_id = res_data.get('seat_id')
                    success = client.create_reservation(res_data, seat_id)
                    if success:
                        self.status_update.emit(row_idx, "등록 완료", "blue")
                    else:
                        self.status_update.emit(row_idx, "등록 실패", "red")
                
                self.progress.emit(i + 1, total)
                
            client.close()
            self.finished.emit("작업 완료")
            
        except Exception as e:
            logging.error(f"ERP Worker Error: {e}")
            self.finished.emit(f"오류 발생: {e}")
            if client:
                client.close()

class ReservationCollectorWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.layout = QVBoxLayout(self)
        
        # Controls
        control_layout = QHBoxLayout()
        
        self.btn_naver_login = QPushButton("네이버 로그인")
        self.btn_naver_login.clicked.connect(self.run_naver_login)
        control_layout.addWidget(self.btn_naver_login)
        
        self.btn_kakao_login = QPushButton("카카오 로그인")
        self.btn_kakao_login.clicked.connect(self.run_kakao_login)
        control_layout.addWidget(self.btn_kakao_login)
        
        self.btn_collect = QPushButton("예약 수집")
        self.btn_collect.clicked.connect(self.run_collect)
        control_layout.addWidget(self.btn_collect)
        
        self.layout.addLayout(control_layout)
        
        # Action Controls
        action_layout = QHBoxLayout()
        self.btn_check = QPushButton("가능 여부 확인")
        self.btn_check.clicked.connect(self.run_check_availability)
        action_layout.addWidget(self.btn_check)
        
        self.btn_register = QPushButton("선택 항목 등록")
        self.btn_register.clicked.connect(self.run_register)
        action_layout.addWidget(self.btn_register)
        
        self.layout.addLayout(action_layout)
        
        # Table
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels(["출처", "원본 내용", "이름", "날짜", "시간", "상태", "선택"])
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.layout.addWidget(self.table)
        
        self.lbl_status = QLabel("대기 중")
        self.layout.addWidget(self.lbl_status)
        
        self.worker_thread = None

    def parse_reservation_data(self, text):
        """
        Attempts to parse name, date, time from raw text.
        Returns: {'name': str, 'date': str, 'time': str}
        """
        data = {'name': '', 'date': '', 'time': ''}
        
        # Regex patterns
        date_pattern = r"(\d{4}-\d{2}-\d{2})|(\d{1,2}월\s*\d{1,2}일)"
        time_pattern = r"(\d{1,2}:\d{2})"
        
        # Find Date
        date_match = re.search(date_pattern, text)
        if date_match:
            d_str = date_match.group(0)
            if "월" in d_str: # Convert "MM월 DD일" to "YYYY-MM-DD" (Assume current year)
                try:
                    today = datetime.date.today()
                    month, day = map(int, re.findall(r"\d+", d_str))
                    # Handle year crossing? For now assume current/next year logic if needed, or just current year
                    year = today.year
                    if month < today.month: # Assuming next year if month is earlier
                        year += 1
                    data['date'] = f"{year}-{month:02d}-{day:02d}"
                except:
                    pass
            else:
                data['date'] = d_str
        
        # Find Time
        time_match = re.search(time_pattern, text)
        if time_match:
            data['time'] = time_match.group(0)
            
        # Name: Heuristic - First word or look for "예약자"
        # This is weak, but better than nothing.
        if "예약자" in text:
            parts = text.split("예약자")
            if len(parts) > 1:
                # Remove colon if present and strip whitespace
                clean_part = parts[1].replace(":", "").strip()
                if clean_part:
                    data['name'] = clean_part.split()[0]
        
        return data

    def run_naver_login(self):
        self.lbl_status.setText("네이버 로그인 창을 띄웁니다...")
        self.btn_naver_login.setEnabled(False)
        
        self.worker = NaverWorker(mode="login")
        self.worker.login_finished.connect(self.on_login_finished)
        
        self.worker_thread = threading.Thread(target=self.worker.run)
        self.worker_thread.start()

    def on_login_finished(self, success):
        self.btn_naver_login.setEnabled(True)
        if success:
            self.lbl_status.setText("네이버 로그인 세션이 저장되었습니다.")
            QMessageBox.information(self, "성공", "로그인 세션이 저장되었습니다.")
        else:
            self.lbl_status.setText("네이버 로그인 실패.")
            QMessageBox.warning(self, "실패", "로그인에 실패했거나 창이 닫혔습니다.")

    def run_kakao_login(self):
        self.lbl_status.setText("카카오 로그인 창을 띄웁니다...")
        self.btn_kakao_login.setEnabled(False)
        
        self.worker = KakaoWorker(mode="login")
        self.worker.login_finished.connect(self.on_kakao_login_finished)
        
        self.worker_thread = threading.Thread(target=self.worker.run)
        self.worker_thread.start()

    def on_kakao_login_finished(self, success):
        self.btn_kakao_login.setEnabled(True)
        if success:
            self.lbl_status.setText("카카오 로그인 세션이 저장되었습니다.")
            QMessageBox.information(self, "성공", "로그인 세션이 저장되었습니다.")
        else:
            self.lbl_status.setText("카카오 로그인 실패.")
            QMessageBox.warning(self, "실패", "로그인에 실패했거나 창이 닫혔습니다.")

    def run_collect(self):
        self.lbl_status.setText("예약 수집 중...")
        self.btn_collect.setEnabled(False)
        self.table.setRowCount(0)
        self.collected_data = [] # Store combined data
        
        # Chain execution: Naver -> Kakao
        self.worker_naver = NaverWorker(mode="collect")
        self.worker_naver.finished.connect(self.on_naver_collect_finished)
        
        self.worker_thread = threading.Thread(target=self.worker_naver.run)
        self.worker_thread.start()

    def on_naver_collect_finished(self, data):
        self.collected_data.extend(data)
        self.lbl_status.setText(f"네이버 수집 완료 ({len(data)}건).")
        
        # Skip Kakao collection as requested
        # self.lbl_status.setText(f"네이버 수집 완료 ({len(data)}건). 카카오 수집 시작...")
        # self.worker_kakao = KakaoWorker(mode="collect")
        # self.worker_kakao.finished.connect(self.on_kakao_collect_finished)
        # self.worker_thread = threading.Thread(target=self.worker_kakao.run)
        # self.worker_thread.start()
        
        # Directly finish
        self.on_all_collect_finished(self.collected_data)

    def on_kakao_collect_finished(self, data):
        self.collected_data.extend(data)
        self.on_all_collect_finished(self.collected_data)

    def parse_naver_date(self, date_str):
        """
        Parses Naver date string: '25. 12. 10.(수) 오전 9:00'
        Returns: {'date': 'YYYY-MM-DD', 'time': 'HH:MM'}
        """
        try:
            # Remove day of week
            clean_str = re.sub(r'\([^\)]+\)', '', date_str)
            # clean_str: '25. 12. 10. 오전 9:00'
            
            parts = clean_str.split()
            # parts: ['25.', '12.', '10.', '오전', '9:00']
            
            year = int(parts[0].replace('.', '')) + 2000
            month = int(parts[1].replace('.', ''))
            day = int(parts[2].replace('.', ''))
            
            ampm = parts[3]
            time_str = parts[4]
            hour, minute = map(int, time_str.split(':'))
            
            if ampm == '오후' and hour != 12:
                hour += 12
            elif ampm == '오전' and hour == 12:
                hour = 0
                
            return {
                'date': f"{year}-{month:02d}-{day:02d}",
                'time': f"{hour:02d}:{minute:02d}"
            }
        except Exception as e:
            logging.error(f"Error parsing Naver date '{date_str}': {e}")
            return {'date': '', 'time': ''}

    def on_all_collect_finished(self, data):
        self.btn_collect.setEnabled(True)
        self.lbl_status.setText(f"총 {len(data)}개의 예약 정보를 수집했습니다.")
        
        self.table.setRowCount(len(data))
        
        # Store processed data for ERP
        self.processed_data_list = []
        
        for i, item in enumerate(data):
            # Parse data
            parsed = {}
            if 'date_str' in item: # Structured data from Naver
                parsed_dt = self.parse_naver_date(item['date_str'])
                parsed['name'] = item['name']
                parsed['date'] = parsed_dt['date']
                parsed['start_time'] = parsed_dt['time']
                parsed['product'] = item.get('product', '')
                parsed['request'] = item.get('request', '')
                parsed['phone'] = item.get('phone', '')
                
                # Calculate end time
                if parsed['start_time']:
                    try:
                        start_dt = datetime.datetime.strptime(f"{parsed['date']} {parsed['start_time']}", "%Y-%m-%d %H:%M")
                        end_dt = start_dt + datetime.timedelta(minutes=item.get('duration_min', 30))
                        parsed['end_time'] = end_dt.strftime("%H:%M")
                    except:
                        parsed['end_time'] = parsed['start_time'] # Fallback
                else:
                    parsed['end_time'] = ''
                    
            else: # Legacy/Kakao (Raw text)
                p = self.parse_reservation_data(item.get('raw_data', ''))
                parsed['name'] = p['name']
                parsed['date'] = p['date']
                parsed['start_time'] = p['time']
                # Default duration 30 mins for unknown sources
                parsed['end_time'] = '' 
                if parsed['start_time']:
                     # Simple addition logic if needed, or leave empty
                     pass

            # Store for ERP Worker
            self.processed_data_list.append({
                'row_index': i,
                'data': parsed
            })
            
            self.table.setItem(i, 0, QTableWidgetItem(item.get('source', 'Unknown')))
            self.table.setItem(i, 1, QTableWidgetItem(item.get('raw_data', '')))
            name_item = QTableWidgetItem(parsed['name'])
            name_item.setData(Qt.ItemDataRole.UserRole, parsed) # Store full data
            self.table.setItem(i, 2, name_item)
            
            self.table.setItem(i, 3, QTableWidgetItem(parsed['date']))
            
            time_display = parsed['start_time']
            if parsed.get('end_time'):
                time_display += f"~{parsed['end_time']}"
            self.table.setItem(i, 4, QTableWidgetItem(time_display))
            
            status_item = QTableWidgetItem("대기")
            status_item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            self.table.setItem(i, 5, status_item)
            
            # Checkbox
            chk = QTableWidgetItem()
            chk.setFlags(Qt.ItemFlag.ItemIsUserCheckable | Qt.ItemFlag.ItemIsEnabled)
            chk.setCheckState(Qt.CheckState.Checked)
            self.table.setItem(i, 6, chk)

    def get_selected_rows(self):
        selected = []
        for i in range(self.table.rowCount()):
            if self.table.item(i, 6).checkState() == Qt.CheckState.Checked:
                # Get full data from UserRole
                name_item = self.table.item(i, 2)
                original_data = name_item.data(Qt.ItemDataRole.UserRole) or {}
                
                # Get visible data (in case user edited, though currently read-only)
                name = name_item.text()
                date = self.table.item(i, 3).text()
                time_str = self.table.item(i, 4).text()
                
                # Basic validation
                if name and date and time_str:
                    # Handle time range (e.g., "09:00~09:30")
                    if "~" in time_str:
                        start_time = time_str.split("~")[0]
                        end_time = time_str.split("~")[1]
                    else:
                        start_time = time_str
                        # Default end time (1 hour later) if not specified
                        try:
                            st_dt = datetime.datetime.strptime(f"{date} {start_time}", "%Y-%m-%d %H:%M")
                            et_dt = st_dt + datetime.timedelta(hours=1)
                            end_time = et_dt.strftime("%H:%M")
                        except:
                            end_time = start_time

                    # Merge original data with current values
                    data = original_data.copy()
                    data.update({
                        'name': name,
                        'date': date,
                        'start_time': start_time,
                        'end_time': end_time
                    })

                    selected.append({
                        'row_index': i,
                        'data': data
                    })
        return selected

    def get_erp_credentials(self):
        settings = QSettings("MyCompany", "ERPCheck")
        return {
            'id': settings.value("erp_id", ""),
            'password': settings.value("erp_password", "")
        }

    def run_check_availability(self):
        rows = self.get_selected_rows()
        if not rows:
            QMessageBox.warning(self, "경고", "선택된 항목이 없거나 날짜/시간 형식이 잘못되었습니다.")
            return
            
        creds = self.get_erp_credentials()
        if not creds['id'] or not creds['password']:
             QMessageBox.warning(self, "경고", "ERP 설정이 없습니다. '누락 확인' 탭에서 로그인 정보를 입력하고 저장(확인 버튼)해주세요.")
             return

        self.lbl_status.setText("가능 여부 확인 중...")
        self.btn_check.setEnabled(False)
        
        self.erp_worker = ERPWorker(mode='check', data=rows, erp_creds=creds)
        self.erp_worker.status_update.connect(self.update_row_status)
        self.erp_worker.finished.connect(self.on_erp_finished)
        
        self.worker_thread = threading.Thread(target=self.erp_worker.run)
        self.worker_thread.start()

    def run_register(self):
        rows = self.get_selected_rows()
        if not rows:
            QMessageBox.warning(self, "경고", "선택된 항목이 없거나 날짜/시간 형식이 잘못되었습니다.")
            return

        reply = QMessageBox.question(self, "확인", f"{len(rows)}건의 예약을 등록하시겠습니까?", 
                                     QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.No:
            return

        creds = self.get_erp_credentials()
        if not creds['id'] or not creds['password']:
             QMessageBox.warning(self, "경고", "ERP 설정이 없습니다. '누락 확인' 탭에서 로그인 정보를 입력하고 저장(확인 버튼)해주세요.")
             return

        self.lbl_status.setText("예약 등록 중...")
        self.btn_register.setEnabled(False)
        
        self.erp_worker = ERPWorker(mode='register', data=rows, erp_creds=creds)
        self.erp_worker.status_update.connect(self.update_row_status)
        self.erp_worker.finished.connect(self.on_erp_finished)
        
        self.worker_thread = threading.Thread(target=self.erp_worker.run)
        self.worker_thread.start()

    def update_row_status(self, row_idx, text, color):
        item = self.table.item(row_idx, 5)
        item.setText(text)
        if color == "green":
            item.setBackground(Qt.GlobalColor.green)
        elif color == "red":
            item.setBackground(Qt.GlobalColor.red)
        elif color == "blue":
            item.setBackground(Qt.GlobalColor.blue)

    def on_erp_finished(self, msg):
        self.btn_check.setEnabled(True)
        self.btn_register.setEnabled(True)
        self.lbl_status.setText(msg)
        QMessageBox.information(self, "완료", msg)

class SettingsWidget(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("설정 기능이 여기에 추가될 예정입니다."))

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("교육일지마스터")
        self.resize(500, 650)
        
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)
        
        # Tabs
        self.tabs = QTabWidget()
        self.missing_memo_widget = MissingMemoWidget()
        self.reservation_widget = ReservationCollectorWidget()
        self.settings_widget = SettingsWidget()
        
        self.tabs.addTab(self.missing_memo_widget, "누락 확인")
        self.tabs.addTab(self.reservation_widget, "예약 수집")
        self.tabs.addTab(self.settings_widget, "설정")
        
        self.layout.addWidget(self.tabs)
        
        # Connect signals
        self.missing_memo_widget.notification_requested.connect(self.show_notification)
        self.missing_memo_widget.window_requested.connect(self.show_window)
        
        # Tray
        self.init_tray()
        
    def init_tray(self):
        self.tray_icon = QSystemTrayIcon(self)
        style = self.style()
        icon = style.standardIcon(style.StandardPixmap.SP_ComputerIcon)
        self.tray_icon.setIcon(icon)
        self.tray_icon.setToolTip("교육일지마스터")
        
        menu = QMenu()
        show_action = QAction("열기", self)
        show_action.triggered.connect(self.show_window)
        menu.addAction(show_action)
        
        check_action = QAction("지금 확인", self)
        # Connect to the missing memo widget's check function
        check_action.triggered.connect(self.missing_memo_widget.run_check)
        menu.addAction(check_action)
        
        quit_action = QAction("종료", self)
        quit_action.triggered.connect(QApplication.instance().quit)
        menu.addAction(quit_action)
        
        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()
        self.tray_icon.activated.connect(self.on_tray_click)

    def show_window(self):
        self.show()
        self.raise_()
        self.activateWindow()

    def show_notification(self, message, type="info"):
        icon = QSystemTrayIcon.MessageIcon.Information
        if type == "warning":
            icon = QSystemTrayIcon.MessageIcon.Warning
        self.tray_icon.showMessage("교육일지마스터", message, icon, 3000)

    def on_tray_click(self, reason):
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_window()

    def closeEvent(self, event):
        # User wants close button to actually quit
        event.accept()

    def changeEvent(self, event):
        if event.type() == QEvent.Type.WindowStateChange:
            if self.windowState() & Qt.WindowState.WindowMinimized:
                # Minimize to tray
                self.hide()
                self.tray_icon.showMessage("교육일지마스터", "프로그램이 트레이로 최소화되었습니다.", QSystemTrayIcon.MessageIcon.Information, 2000)
        super().changeEvent(event)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(True) # Quit when window closes
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
