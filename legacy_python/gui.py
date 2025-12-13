import sys
from scheduler_widget import WeeklySchedulerWidget
import schedule
import time
import threading
import datetime
import winreg
import csv
from collections import defaultdict, Counter
import os
import base64
from PyQt6.QtCore import QTimer, pyqtSignal, QObject, Qt, QSettings, QEvent, QMetaObject, Q_ARG, pyqtSlot
from PyQt6.QtWidgets import (QApplication, QSystemTrayIcon, QMenu, QMessageBox, 
                             QMainWindow, QVBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QListWidget, QListWidgetItem, QWidget, QCheckBox, QHBoxLayout, QProgressDialog,
                             QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView,
                             QRadioButton, QButtonGroup, QGridLayout, QFrame, QTextEdit,
                             QSplitter, QGroupBox, QAbstractItemView, QFormLayout, QSpinBox)
from PyQt6.QtGui import QIcon, QAction, QCloseEvent, QColor, QPixmap, QBrush
from erp_client import ERPClient
from naver_client import NaverClient
from kakao_client import KakaoClient
from kakao_client import KakaoClient
import logging
import re
import datetime


# Setup logging (redundant if imported from erp_client but good for safety)
# erp_client sets it up globally, so we just use logging.

GLOBAL_STYLESHEET = """
QMainWindow, QWidget {
    background-color: #f0f0f0;
    font-family: 'Malgun Gothic', sans-serif;
    font-size: 14px;
}
QPushButton {
    background-color: #2196f3;
    color: white;
    border-radius: 4px;
    padding: 8px 16px;
    font-weight: bold;
    border: none;
}
QPushButton:hover {
    background-color: #1976d2;
}
QPushButton:disabled {
    background-color: #bdbdbd;
}
QLineEdit, QTextEdit, QListWidget, QTableWidget {
    background-color: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px;
}
QGroupBox {
    border: 1px solid #ddd;
    border-radius: 4px;
    margin-top: 1em;
    background-color: white;
    padding: 10px;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 3px 0 3px;
    font-weight: bold;
    color: #333;
}
QTabWidget::pane {
    border: 1px solid #ccc;
    background-color: white;
    border-radius: 4px;
}
QTabBar::tab {
    background: #e0e0e0;
    border: 1px solid #ccc;
    padding: 8px 12px;
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
    margin-right: 2px;
}
QTabBar::tab:selected {
    background: white;
    border-bottom-color: white;
    font-weight: bold;
}
QHeaderView::section {
    background-color: #e0e0e0;
    padding: 4px;
    border: 1px solid #ccc;
    font-weight: bold;
}
QStatusBar {
    background-color: #e0e0e0;
    color: #333;
}
"""


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
            client.close()



class SmartLogEditor(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_history_data = {}
        self.current_duration = 0
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)
        
        # 1. General Memo Viewer
        layout.addWidget(QLabel("일반 메모:"))
        self.general_viewer = QTextEdit()
        self.general_viewer.setReadOnly(True)
        self.general_viewer.setMaximumHeight(80)
        # Inherits global style, but add specific background if needed or keep default white
        # User requested padding/margin adjustment. Global style handles padding.
        # Let's keep the background slightly distinct if desired, or just white.
        # User said "current #fff3e0 background + padding".
        self.general_viewer.setStyleSheet("""
            QTextEdit {
                background-color: #fff3e0;
                border: 1px solid #ffcc80;
                padding: 8px;
            }
        """)
        layout.addWidget(self.general_viewer)
        
        # 2. Education History Table
        layout.addWidget(QLabel("교육 이력:"))
        self.history_table = QTableWidget()
        self.history_table.setColumnCount(2)
        self.history_table.setHorizontalHeaderLabels(["날짜", "내용"])
        self.history_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        self.history_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.history_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.history_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.history_table.setShowGrid(False) # Remove grid lines
        # Alternative: Very light grid
        # self.history_table.setStyleSheet("gridline-color: #eee;")
        layout.addWidget(self.history_table)
        
        # 3. Preview & Save
        layout.addWidget(QLabel("메모 미리보기:"))
        self.input_preview = QTextEdit()
        self.input_preview.setMaximumHeight(60)
        layout.addWidget(self.input_preview)
        
        self.btn_save = QPushButton("임시 저장")
        self.btn_save.setStyleSheet("background-color: #2196f3; color: white; font-weight: bold; padding: 8px;")
        layout.addWidget(self.btn_save)

    def update_preview(self):
        # Format: Duration/
        # Duration is auto-filled from loaded user data
        time_val = str(self.current_duration) if self.current_duration else ""
        if time_val.endswith(".0"):
            time_val = time_val[:-2] # Remove .0
        
        # Just set the prefix, user types the rest
        current_text = self.input_preview.toPlainText()
        
        # Regex to find existing prefix like "3/" or "1.5/" at the start
        # Pattern: Start of string, digits, optional decimal, slash
        pattern = r"^\d+(\.\d+)?/"
        
        if re.match(pattern, current_text):
            # Replace existing prefix
            new_text = re.sub(pattern, f"{time_val}/", current_text, count=1)
            self.input_preview.setText(new_text)
        elif not current_text:
            self.input_preview.setText(f"{time_val}/")
        else:
            # Prepend if no prefix exists
            self.input_preview.setText(f"{time_val}/{current_text}")

    def load_user(self, name, history_data, duration, photo_data=""):
        self.current_duration = duration
        self.current_history_data = history_data
        
        # 1. Update General Memo
        general_memo = history_data.get('general', '')
        self.general_viewer.setPlainText(general_memo)
        
        # 2. Update History Table
        education_history = history_data.get('education', [])
        # Sort by date descending (newest first)
        education_history.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        self.history_table.setRowCount(len(education_history))
        
        for i, item in enumerate(education_history):
            date_item = QTableWidgetItem(item.get('date', ''))
            content_item = QTableWidgetItem(item.get('content', ''))
            self.history_table.setItem(i, 0, date_item)
            self.history_table.setItem(i, 1, content_item)
            
        # 3. Update Preview
        self.update_preview()

    def clear(self):
        self.current_duration = 0
        self.current_history_data = {}
        self.general_viewer.clear()
        self.history_table.setRowCount(0)
        self.input_preview.clear()

class EducationManagerWidget(QWidget):
    def __init__(self, erp_client):
        super().__init__()
        self.erp = erp_client
        self.missing_list = [] # List of dicts: {index, name, title, duration, date, history, photo}
        self.drafts = {} # name -> text
        
        self.layout = QVBoxLayout(self)
        
        # Top Controls
        top_layout = QHBoxLayout()
        
        self.btn_check = QPushButton("오늘 예약 확인")
        self.btn_check.clicked.connect(self.run_check)
        top_layout.addWidget(self.btn_check)
        
        self.chk_browser = QCheckBox("브라우저 표시")
        top_layout.addWidget(self.chk_browser)
        
        self.lbl_status = QLabel("대기 중")
        top_layout.addWidget(self.lbl_status)
        
        self.lbl_op_time = QLabel("")
        self.lbl_op_time.setStyleSheet("color: blue; font-weight: bold; margin-left: 10px;")
        top_layout.addWidget(self.lbl_op_time)
        
        self.layout.addLayout(top_layout)
        
        # Main Splitter
        main_split_layout = QHBoxLayout()
        
        # Left: List
        left_layout = QVBoxLayout()
        self.list_widget = QListWidget()
        self.list_widget.setSelectionMode(QListWidget.SelectionMode.ExtendedSelection)
        self.list_widget.itemClicked.connect(self.on_item_clicked)
        left_layout.addWidget(self.list_widget)
        
        # List Controls
        list_btn_layout = QHBoxLayout()
        self.btn_delete_selected = QPushButton("선택 삭제")
        self.btn_delete_selected.clicked.connect(self.delete_selected_items)
        list_btn_layout.addWidget(self.btn_delete_selected)
        
        self.btn_delete_all = QPushButton("전체 삭제")
        self.btn_delete_all.clicked.connect(self.delete_all_items)
        list_btn_layout.addWidget(self.btn_delete_all)
        
        left_layout.addLayout(list_btn_layout)
        
        # Right: Editor
        self.editor = SmartLogEditor()
        self.editor.btn_save.clicked.connect(self.save_draft)
        
        main_split_layout.addLayout(left_layout, 4)
        main_split_layout.addWidget(self.editor, 6)
        
        self.layout.addLayout(main_split_layout)
        
        # Bottom: Batch Controls
        bottom_layout = QHBoxLayout()
        self.btn_send_all = QPushButton("일괄 전송")
        self.btn_send_all.setStyleSheet('''
            QPushButton {
                background-color: #4caf50;
                color: white;
                font-weight: bold;
                padding: 12px;
                font-size: 14px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #43a047;
            }
            QPushButton:disabled {
                background-color: #bdbdbd;
            }
        ''')
        self.btn_send_all.clicked.connect(self.send_all_memos)
        self.btn_send_all.setEnabled(False)
        bottom_layout.addWidget(self.btn_send_all)
        
        self.layout.addLayout(bottom_layout)
        
        # Scheduler
        self.timer = QTimer()
        self.timer.timeout.connect(self.check_schedule)
        self.timer.start(60000)
        
        # Auto Check Logic
        QTimer.singleShot(1000, self.check_auto_run)
        
        # Weekdays at 20:00
        schedule.every().monday.at("20:00").do(self.scheduled_check)
        schedule.every().tuesday.at("20:00").do(self.scheduled_check)
        schedule.every().wednesday.at("20:00").do(self.scheduled_check)
        schedule.every().thursday.at("20:00").do(self.scheduled_check)
        schedule.every().friday.at("20:00").do(self.scheduled_check)
        
        # Weekends at 17:00
        schedule.every().saturday.at("17:00").do(self.scheduled_check)
        schedule.every().sunday.at("17:00").do(self.scheduled_check)

    def run_check(self):
        self.lbl_status.setText("데이터 확인 중...")
        self.btn_check.setEnabled(False)
        self.list_widget.clear()
        self.editor.clear()
        
        is_headless = not self.chk_browser.isChecked()
        threading.Thread(target=self._check_thread, args=(is_headless,)).start()

    def check_auto_run(self):
        settings = QSettings("MyCompany", "ERPCheck")
        if settings.value("auto_check", False, type=bool):
            self.run_check()

    def _check_thread(self, headless):
        try:
            settings = QSettings("MyCompany", "ERPCheck")
            erp_id = settings.value("erp_id", "")
            erp_password = settings.value("erp_password", "")
            
            client = ERPClient(headless=headless, erp_id=erp_id, erp_password=erp_password)
            client.start()
            if client.login():
                data, op_time = client.get_daily_reservations()
                # Data is now fully populated by get_daily_reservations
                # for item in data:
                #     hist = client.get_member_history(item['name'])
                #     item['history'] = hist
                #     item['photo'] = hist.get('photo', '')
                
                QMetaObject.invokeMethod(self, "on_check_finished", Qt.ConnectionType.QueuedConnection, Q_ARG(list, data), Q_ARG(str, op_time))
            else:
                self.lbl_status.setText("ERP 로그인 실패")
            # client.close() # Moved to finally block logic
        except Exception as e:
            print(f"Check error: {e}")
            self.lbl_status.setText("오류 발생")
        finally:
            if client:
                client.close()

    @pyqtSlot(list, str)
    def on_check_finished(self, data, op_time):
        self.missing_list = data
        self.list_widget.clear()
        self.btn_check.setEnabled(True)
        
        if not data:
            self.lbl_status.setText("금일 교육 내역이 없습니다.")
            if op_time:
                self.lbl_op_time.setText(f"운영시간: {op_time}")
            else:
                self.lbl_op_time.clear()
            return
            
        self.lbl_status.setText(f"{len(data)}건의 교육 내역을 찾았습니다.")
        if op_time:
            self.lbl_op_time.setText(f"운영시간: {op_time}")
        else:
            self.lbl_op_time.clear()
            
        self.btn_send_all.setEnabled(True)
        
        for item in data:
            name = item['name']
            # engine = RecommendationEngine()
            # user_type = engine.classify_user(name)
            if '도로' in name:
                user_type = 'ROAD'
            elif '합' in name:
                user_type = 'FULL'
            else:
                user_type = 'REFRESHER'
            
            type_str = ""
            color = Qt.GlobalColor.black
            
            # Check product name from history if available
            history = item.get('history', {})
            product_name = history.get('product', '')
            title = item.get('title', '') # Get full title
            
            if '리뷰' in name or '리뷰' in product_name or '리뷰' in title:
                type_str = "[리뷰]"
                color = QColor("orange")
            elif '상담' in name:
                type_str = "[상담]"
                color = QColor("gray")
            elif user_type == 'ROAD':
                type_str = "[도로]"
                color = QColor("green")
            elif user_type == 'FULL':
                type_str = "[합무]"
                color = QColor("purple")
            elif user_type == 'REFRESHER':
                type_str = "[장롱]"
                color = QColor("blue")
            
            # Check if education log for today exists
            today_str = datetime.datetime.now().strftime("%Y-%m-%d")
            education_list = history.get('education', [])
            has_today_log = False
            for edu in education_list:
                if edu.get('date') == today_str:
                    has_today_log = True
                    break
            
            if not has_today_log:
                display_text = f"{type_str} {name} ({item['duration']}시간) [미작성]"
                list_item = QListWidgetItem(display_text)
                list_item.setForeground(color)
                # [미작성] - Warning color (Orange/Yellow background), Bold text
                list_item.setBackground(QColor("#fff3e0")) 
                font = list_item.font()
                font.setBold(True)
                list_item.setFont(font)
            else:
                display_text = f"{type_str} {name} ({item['duration']}시간) [완료]"
                list_item = QListWidgetItem(display_text)
                list_item.setForeground(color)
                # [완료] - Light Green background
                list_item.setBackground(QColor("#e6ffe6"))
            
            # Check if saved draft exists (override background if saved, or combine?)
            # User requested [저장됨] to have Light Blue background.
            # Saved status is usually checked via text prefix in current logic, 
            # but here we are rebuilding the list.
            # We need to check self.drafts
            if name in self.drafts:
                 list_item.setText(f"[저장됨] {list_item.text()}")
                 list_item.setBackground(QColor("#e6f0ff"))

            self.list_widget.addItem(list_item)

    def on_item_clicked(self, item):
        row = self.list_widget.row(item)
        if row < 0 or row >= len(self.missing_list):
            return
            
        data = self.missing_list[row]
        name = data['name']
        
        self.editor.load_user(
            name, 
            data.get('history', {}), 
            data.get('duration', 1.0),
            data.get('photo', '')
        )

    def save_draft(self):
        row = self.list_widget.currentRow()
        if row < 0:
            return
            
        text = self.editor.input_preview.toPlainText()
        if not text:
            return
            
        data = self.missing_list[row]
        self.drafts[data['name']] = text
        
        item = self.list_widget.item(row)
        if not item.text().startswith("[저장됨]"):
            item.setText(f"[저장됨] {item.text()}")
            
        QMessageBox.information(self, "저장", "임시 저장되었습니다.")

    def send_all_memos(self):
        memos_to_send = []
        
        for i, data in enumerate(self.missing_list):
            name = data['name']
            memo_text = ""
            
            if name in self.drafts:
                memo_text = self.drafts[name]
            else:
                continue
                
            if memo_text:
                memos_to_send.append({
                    'index': data['index'],
                    'name': name,
                    'text': memo_text,
                    'date': data['date']
                })
        
        if not memos_to_send:
            QMessageBox.warning(self, "경고", "전송할 내용이 없습니다. 먼저 임시 저장을 해주세요.")
            return
            
        confirm = QMessageBox.question(self, "확인", f"{len(memos_to_send)}건의 메모를 전송하시겠습니까?", 
                                     QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if confirm == QMessageBox.StandardButton.No:
            return

        self.btn_send_all.setEnabled(False)
        self.lbl_status.setText("일괄 전송 중...")
        
        is_headless = not self.chk_browser.isChecked()
        
        settings = QSettings("MyCompany", "ERPCheck")
        erp_id = settings.value("erp_id", "")
        erp_password = settings.value("erp_password", "")
        
        self.batch_worker = BatchMemoWriter(memos_to_send, headless=is_headless, erp_id=erp_id, erp_password=erp_password)
        self.batch_worker.finished.connect(self.on_batch_finished)
        threading.Thread(target=self.batch_worker.run).start()

    @pyqtSlot(dict)
    def on_batch_finished(self, results):
        success_count = sum(1 for v in results.values() if v)
        self.lbl_status.setText(f"전송 완료: 성공 {success_count}건, 실패 {len(results)-success_count}건")
        self.btn_send_all.setEnabled(True)
        
        for i, data in enumerate(self.missing_list):
            # Use index as key matching write_memos_batch return
            idx = data['index']
            if results.get(idx):
                # Update UI Item
                item = self.list_widget.item(i)
                text = item.text()
                if "[미작성]" in text:
                    new_text = text.replace("[미작성]", "[완료]")
                    item.setText(new_text)
                    # Reset background to transparent/default
                    item.setBackground(QBrush(Qt.GlobalColor.transparent))
                
                # Update Local History
                name = data['name']
                if name in self.drafts:
                    draft_text = self.drafts[name]
                    today_str = datetime.date.today().strftime("%Y-%m-%d")
                    
                    # Add to history structure
                    new_edu = {
                        'date': today_str,
                        'content': draft_text
                    }
                    if 'education' not in data['history']:
                        data['history']['education'] = []
                    # Insert at beginning
                    data['history']['education'].insert(0, new_edu)
                    
                    # Remove from drafts
                    del self.drafts[name]
                    
                    # If currently selected, reload editor to show new history
                    current_row = self.list_widget.currentRow()
                    if current_row == i:
                        self.editor.input_preview.clear()
                        self.on_item_clicked(item)

        QMessageBox.information(self, "완료", f"총 {len(results)}건 중 {success_count}건 전송 성공")

    def delete_selected_items(self):
        selected_items = self.list_widget.selectedItems()
        if not selected_items:
            return
            
        rows = sorted([self.list_widget.row(item) for item in selected_items], reverse=True)
        
        for row in rows:
            if row < len(self.missing_list):
                self.missing_list.pop(row)
            self.list_widget.takeItem(row)
            
        self.editor.clear()
        self.lbl_status.setText(f"{len(rows)}개의 항목이 삭제되었습니다.")

    def delete_all_items(self):
        if not self.missing_list:
            return
            
        confirm = QMessageBox.question(self, "확인", "모든 항목을 삭제하시겠습니까?", QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if confirm == QMessageBox.StandardButton.No:
            return
            
        self.list_widget.clear()
        self.missing_list = []
        self.editor.clear()
        self.lbl_status.setText("모든 항목이 삭제되었습니다.")

    def check_schedule(self):
        schedule.run_pending()

    def scheduled_check(self):
        self.run_check()



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
            # --- REAL MODE ---
            try:
                data = self.client.get_reservations()
                print(f"DEBUG_COLLECTED_DATA: {len(data)} items")
                self.finished.emit(data)
            except Exception as e:
                print(f"Naver collect error: {e}")
                self.finished.emit([])

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

class CalendarWorker(QObject):
    finished = pyqtSignal(list)
    
    def __init__(self, start_date, end_date, erp_creds=None):
        super().__init__()
        self.start_date = start_date
        self.end_date = end_date
        self.erp_creds = erp_creds

    def run(self):
        erp_id = self.erp_creds.get('id') if self.erp_creds else None
        erp_password = self.erp_creds.get('password') if self.erp_creds else None
        
        # Headless=True for background fetching
        client = ERPClient(headless=True, erp_id=erp_id, erp_password=erp_password)
        try:
            client.start()
            if client.login():
                events = client.get_events_range(self.start_date, self.end_date)
                self.finished.emit(events if events else [])
            else:
                self.finished.emit([])
            client.close()
        except Exception as e:
            logging.error(f"CalendarWorker Error: {e}")
            self.finished.emit([])


class ReservationCollectorWidget(QWidget):
    def __init__(self, erp_client):
        super().__init__()
        self.erp = erp_client
        self.layout = QVBoxLayout(self)
        
        self.collected_data = []
        
        # --- Controls Group ---
        grp_controls = QGroupBox("예약 수집 및 관리")
        control_layout = QHBoxLayout(grp_controls)
        
        # Naver Login
        self.btn_naver_login = QPushButton("네이버 로그인")
        self.btn_naver_login.setStyleSheet("background-color: #03C75A; color: white;")
        self.btn_naver_login.clicked.connect(self.run_naver_login)
        control_layout.addWidget(self.btn_naver_login)
        
        # Kakao Login
        self.btn_kakao_login = QPushButton("카카오 로그인")
        self.btn_kakao_login.setStyleSheet("background-color: #FEE500; color: #3c1e1e;")
        self.btn_kakao_login.clicked.connect(self.run_kakao_login)
        control_layout.addWidget(self.btn_kakao_login)
        
        # Collect (Naver)
        self.btn_collect = QPushButton("예약 수집 (네이버)")
        self.btn_collect.clicked.connect(self.run_collect)
        control_layout.addWidget(self.btn_collect)
        
        # Check Availability
        self.btn_check = QPushButton("가능 여부 확인")
        self.btn_check.clicked.connect(self.run_check_availability)
        self.btn_check.setEnabled(False) # Enable after collection
        control_layout.addWidget(self.btn_check)
        
        # Register
        self.btn_register = QPushButton("선택 항목 등록")
        self.btn_register.clicked.connect(self.run_register)
        self.btn_register.setStyleSheet("background-color: #ff9800; color: white; font-weight: bold;")
        self.btn_register.setEnabled(False)
        control_layout.addWidget(self.btn_register)
        
        self.layout.addWidget(grp_controls)
        
        # --- Table Widget ---
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels(["출처", "원본 데이터", "이름", "날짜", "시간", "상태", "선택"])
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.layout.addWidget(self.table)
        
        # --- Status Bar ---
        self.lbl_status = QLabel("대기 중")
        self.lbl_status.setStyleSheet("""
            QLabel {
                background-color: #e0e0e0;
                padding: 5px;
                border-top: 1px solid #ccc;
                color: #333;
                font-size: 12px;
            }
        """)
        self.layout.addWidget(self.lbl_status)
        
        self.worker_thread = None

    def parse_reservation_data(self, text):
        # Attempts to parse name, date, time from raw text.
        # Returns: {'name': str, 'date': str, 'time': str}
        data = {'name': '', 'date': '', 'time': ''}
        
        # Regex patterns
        date_pattern = r"(\d{4}-\d{2}-\d{2})|(\d{1,2}월\s*\d{1,2}일)|(\d{4}/\d{1,2}/\d{1,2})|(\d{1,2}/\d{1,2}/\d{4})"
        time_pattern = r"(\d{1,2}:\d{2})"
        
        # Find Date
        date_match = re.search(date_pattern, text)
        if date_match:
            d_str = date_match.group(0)
            if "월" in d_str: # Convert "MM월 DD일" to "YYYY-MM-DD"
                try:
                    today = datetime.date.today()
                    month, day = map(int, re.findall(r"\d+", d_str))
                    year = today.year
                    if month < today.month: 
                        year += 1
                    data['date'] = f"{year}-{month:02d}-{day:02d}"
                except:
                    pass
            elif "/" in d_str: # Handle slash formats
                try:
                    parts = d_str.split('/')
                    if len(parts[0]) == 4: # YYYY/MM/DD
                        data['date'] = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
                    else: # MM/DD/YYYY
                        data['date'] = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                except:
                    pass
            else:
                data['date'] = d_str
        
        # Find Time
        time_match = re.search(time_pattern, text)
        if time_match:
            data['time'] = time_match.group(0)
            
        # Name: Heuristic - First word or look for "예약자"
        if "예약자" in text:
            parts = text.split("예약자")
            if len(parts) > 1:
                clean_part = parts[1].replace(":", "").strip()
                if clean_part:
                    data['name'] = clean_part.split()[0]
        
        return data

    def run_naver_login(self):
        self.lbl_status.setText("네이버 로그인 창을 띄웁니다...")
        self.btn_naver_login.setEnabled(False)
        
        self.worker = NaverWorker(mode="login")
        self.worker.login_finished.connect(self.on_login_finished)
        self.worker.start()

    def run_kakao_login(self):
        self.lbl_status.setText("카카오 로그인 창을 띄웁니다...")
        self.btn_kakao_login.setEnabled(False)
        
        self.worker = KakaoWorker(mode="login")
        self.worker.login_finished.connect(self.on_kakao_login_finished)
        
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
        
        # Directly finish
        self.on_all_collect_finished(self.collected_data)

    def on_kakao_collect_finished(self, data):
        self.collected_data.extend(data)
        self.on_all_collect_finished(self.collected_data)

    # on_collection_finished removed as it is merged into on_naver_finished

    def run_register(self):
        # Placeholder for registration logic
        QMessageBox.information(self, "알림", "선택 항목 등록 기능은 아직 구현되지 않았습니다.")

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
        # Parses Naver date string: '25. 12. 10.(수) 오전 9:00'
        # Returns: {'date': 'YYYY-MM-DD', 'time': 'HH:MM'}
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
                parsed['option'] = item.get('option', '')
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
                date = self.table.item(i, 3).text().strip()
                
                # Normalize date to YYYY-MM-DD if users used slashes
                if "/" in date:
                    try:
                        parts = date.split('/')
                        if len(parts[0]) == 4: # YYYY/MM/DD
                            date = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
                        else: # MM/DD/YYYY
                            date = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
                    except:
                        pass # Keep original if parse fails
                        
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

                    # Extract Seat ID from Status column (index 5) if available
                    status_text = self.table.item(i, 5).text()
                    seat_id = None
                    if "가능 (" in status_text:
                        # Format: "가능 (dobong-X)" or "예약 가능 (dobong-X)"
                        try:
                            seat_id = status_text.split("(")[1].split(")")[0]
                        except:
                            pass
                            
                    # Merge original data with current values
                    data = original_data.copy()
                    data.update({
                        'name': name,
                        'date': date,
                        'start_time': start_time,
                        'end_time': end_time,
                        'seat_id': seat_id
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

        self.lbl_status.setText("예약 데이터 불러오는 중 (향후 2주)...")
        self.btn_check.setEnabled(False)
        
        # Fetch 2 weeks of data
        today = datetime.date.today()
        start_date = today
        end_date = today + datetime.timedelta(weeks=2)
        
        self.calendar_worker = CalendarWorker(start_date, end_date, creds)
        self.calendar_worker.finished.connect(self.on_availability_data_loaded)
        
        self.worker_thread = threading.Thread(target=self.calendar_worker.run)
        self.worker_thread.start()

    def on_availability_data_loaded(self, events):
        self.btn_check.setEnabled(True)
        self.lbl_status.setText(f"데이터 로드 완료 ({len(events)}건). 가능 여부 판별 중...")
        
        rows = self.get_selected_rows()
        
        for row in rows:
            row_idx = row['row_index']
            data = row['data']
            
            status = "확인 필요"
            color = "black"
            
            try:
                # Parse requested date/time
                req_date = datetime.datetime.strptime(data['date'], "%Y-%m-%d").date()
                req_start_time = datetime.datetime.strptime(f"{data['date']} {data['start_time']}", "%Y-%m-%d %H:%M")
                
                # 1. Check Operating Hours
                # Weekdays (0-4): 09:00 - 21:00
                # Saturday (5): 10:00 - 18:00
                # Sunday (6): Closed (Assume closed for now, or check specific logic)
                
                weekday = req_date.weekday()
                hour = req_start_time.hour
                
                is_open = False
                if 0 <= weekday <= 4: # Mon-Fri
                    if 9 <= hour < 21:
                        is_open = True
                elif weekday == 5: # Sat
                    if 10 <= hour < 18:
                        is_open = True
                
                if not is_open:
                    status = "영업시간 아님"
                    color = "red"
                else:
                    # Determine Request Type (Consultation vs Driving)
                    has_consultation = "상담" in data.get('product', '') or "상담" in data.get('raw_data', '')
                    has_review_note = "리뷰노트" in data.get('request', '') or "리뷰노트" in data.get('raw_data', '')
                    
                    # Review Note overrides Consultation -> Treated as Driving
                    is_consultation = has_consultation and not has_review_note
                    
                    # Filter Events based on type
                    # Driving Seats: 1, 2, 3, 5, 6 (Exclude 4, 7, 8, 9) 
                    # Note: User mentioned 4 is Operation. 7, 8 are likely valid seats too? 
                    # User said: "운용가능한 기기 5대중 4대가 차있고" -> implies 5 driving seats.
                    # Let's assume 1, 2, 3, 5, 6 are the main driving seats.
                    # Seat 4 is Operation.
                    # Seat 9 is Consultation.
                    # What about 7, 8? 
                    # In the grid view code, I highlighted 4, 7, 8. 
                    # User said "dobong-4번은 운영시간... 항상 '운영'이라는 이름...".
                    # User said "운용가능한 기기 5대".
                    # If 1, 2, 3, 5, 6 are the 5 seats, then 7 and 8 are also excluded?
                    # Let's stick to the user's implication: "Driving Capacity = 5".
                    # So we count events on 1, 2, 3, 5, 6.
                    
                    overlap_count = 0
                    overlapping_events = []
                    
                    # Define target seats based on request type
                    target_seats = []
                    max_capacity = 0
                    
                    if is_consultation:
                        target_seats = ['dobong-9'] # Consultation Seat
                        max_capacity = 1
                    else:
                        # Driving Seats: 1, 2, 3, 5, 6
                        target_seats = ['dobong-1', 'dobong-2', 'dobong-3', 'dobong-5', 'dobong-6']
                        max_capacity = 5
                    
                    occupied_seats = set()
                    
                    # Check overlaps
                    for e in events:
                        # Check Seat
                        r_id = str(e.get('resourceId', ''))
                        
                        # Normalize r_id to match target_seats format (dobong-X)
                        seat_match = None
                        for ts in target_seats:
                            if ts in r_id:
                                seat_match = ts
                                break
                        
                        if not seat_match:
                            # Try number matching if r_id is just '1', '2', etc.
                            try:
                                if '-' in r_id:
                                    num = r_id.split('-')[-1]
                                else:
                                    num = r_id
                                
                                for ts in target_seats:
                                    ts_num = ts.split('-')[-1]
                                    if num == ts_num:
                                        seat_match = ts
                                        break
                            except: pass
                            
                        if not seat_match:
                            continue

                        e_start = e['start']
                        e_end = e['end']
                        
                        # Check time overlap
                        req_end_time = req_start_time + datetime.timedelta(hours=1) # Default 1h
                        if data.get('end_time'):
                             try:
                                 req_end_time = datetime.datetime.strptime(f"{data['date']} {data['end_time']}", "%Y-%m-%d %H:%M")
                             except:
                                 pass
                        
                        if e_start < req_end_time and e_end > req_start_time:
                            occupied_seats.add(seat_match)
                            
                    overlap_count = len(occupied_seats)
                    
                    if overlap_count >= max_capacity:
                        if is_consultation:
                            status = "상담 마감"
                        else:
                            status = f"예약 마감 ({overlap_count}/{max_capacity})"
                        color = "red"
                    else:
                        # Find first available seat
                        available_seat = None
                        for ts in target_seats:
                            if ts not in occupied_seats:
                                available_seat = ts
                                break
                                
                        # 3. Check Conflicts (Duplicate Booking)
                        req_name = data['name'].replace(" ", "")
                        is_duplicate = False
                        
                        for e in events: # Check all events for duplicate name
                             e_start = e['start']
                             e_end = e['end']
                             if e_start.date() != req_date: continue
                             
                             e_title = e['title'].replace(" ", "")
                             if req_name in e_title:
                                 # Check time overlap
                                 req_end_time = req_start_time + datetime.timedelta(hours=1)
                                 if data.get('end_time'):
                                     try:
                                         req_end_time = datetime.datetime.strptime(f"{data['date']} {data['end_time']}", "%Y-%m-%d %H:%M")
                                     except:
                                         pass
                                         
                                 if e_start < req_end_time and e_end > req_start_time:
                                     is_duplicate = True
                                     break
                        
                        if is_duplicate:
                            status = "중복 예약"
                            color = "red"
                        else:
                            if is_consultation:
                                status = f"가능 ({available_seat})" if available_seat else "상담 가능"
                            else:
                                status = f"가능 ({available_seat})" if available_seat else f"예약 가능 ({overlap_count}/{max_capacity})"
                            color = "green"
                        
            except Exception as e:
                logging.error(f"Validation error for row {row_idx}: {e}")
                status = "오류"
                color = "red"
            
            self.update_row_status(row_idx, status, color)
            
        self.lbl_status.setText("가능 여부 확인 완료")

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
            item.setBackground(QColor("#e8f5e9")) # Light Green
        elif color == "red":
            item.setBackground(QColor("#ffebee")) # Light Red
        elif color == "blue":
            item.setBackground(QColor("#e3f2fd")) # Light Blue
        elif color == "orange":
            item.setBackground(QColor("#fff3e0")) # Light Orange

    def on_erp_finished(self, msg):
        self.btn_check.setEnabled(True)
        self.btn_register.setEnabled(True)
        self.lbl_status.setText(msg)
        QMessageBox.information(self, "완료", msg)

class SettingsWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.layout = QVBoxLayout(self)
        self.layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        # 1. System Settings Group
        grp_system = QGroupBox("시스템 설정")
        layout_system = QVBoxLayout(grp_system)
        
        # Start on Boot
        self.chk_startup = QCheckBox("윈도우 시작 시 자동 실행")
        self.chk_startup.clicked.connect(self.toggle_startup)
        layout_system.addWidget(self.chk_startup)
        
        # Auto Check on App Start
        self.chk_auto_check = QCheckBox("프로그램 실행 시 '금일 교육 확인' 자동 실행")
        layout_system.addWidget(self.chk_auto_check)
        
        self.layout.addWidget(grp_system)
        
        # 2. ERP Account Settings Group
        grp_account = QGroupBox("ERP 계정 설정")
        layout_account = QFormLayout(grp_account)
        
        self.input_id = QLineEdit()
        self.input_id.setPlaceholderText("ERP ID")
        
        self.input_pw = QLineEdit()
        self.input_pw.setPlaceholderText("ERP Password")
        self.input_pw.setEchoMode(QLineEdit.EchoMode.Password)
        
        layout_account.addRow("아이디:", self.input_id)
        layout_account.addRow("비밀번호:", self.input_pw)
        
        self.layout.addWidget(grp_account)
        
        # Save Button
        self.btn_save = QPushButton("설정 저장")
        self.btn_save.clicked.connect(self.save_settings)
        self.btn_save.setStyleSheet("background-color: #2196f3; color: white; padding: 10px; font-weight: bold;")
        self.layout.addWidget(self.btn_save)
        
        # Load initial state
        self.load_settings()
        self.check_startup_status()

    def check_startup_status(self):
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "운영고수"
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
            winreg.QueryValueEx(key, app_name)
            winreg.CloseKey(key)
            self.chk_startup.setChecked(True)
        except:
            self.chk_startup.setChecked(False)

    def toggle_startup(self):
        # Just update UI state, actual change happens on save? 
        # Or immediate? User requested toggle button.
        # Usually startup settings are immediate or on save. 
        # Let's make it immediate for this specific toggle as it interacts with Registry directly.
        # Actually, let's stick to "Save" button for everything to be consistent.
        pass

    def load_settings(self):
        settings = QSettings("MyCompany", "ERPCheck")
        
        # Auto Check
        self.chk_auto_check.setChecked(settings.value("auto_check", False, type=bool))
        
        # Credentials
        self.input_id.setText(settings.value("erp_id", ""))
        self.input_pw.setText(settings.value("erp_password", ""))

    def save_settings(self):
        settings = QSettings("MyCompany", "ERPCheck")
        
        # 1. Save Auto Check
        settings.setValue("auto_check", self.chk_auto_check.isChecked())
        
        # 2. Save Credentials
        settings.setValue("erp_id", self.input_id.text())
        settings.setValue("erp_password", self.input_pw.text())
        
        # 3. Apply Startup Setting
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "운영고수"
        
        try:
            if self.chk_startup.isChecked():
                exe_path = sys.executable
                # If running as script, use python executable + script path (but usually we build exe)
                # Assuming frozen exe for end user.
                if not getattr(sys, 'frozen', False):
                    # Development mode: Don't actually set run key to python.exe to avoid mess
                    logging.warning("Startup registry not set in development mode.")
                else:
                    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE)
                    winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, exe_path)
                    winreg.CloseKey(key)
            else:
                try:
                    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_WRITE)
                    winreg.DeleteValue(key, app_name)
                    winreg.CloseKey(key)
                except FileNotFoundError:
                    pass # Already deleted
                    
            QMessageBox.information(self, "저장 완료", "설정이 저장되었습니다.")
            
        except Exception as e:
            QMessageBox.critical(self, "오류", f"설정 저장 중 오류가 발생했습니다:\n{e}")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("운영고수")
        self.resize(500, 650)
        
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.layout = QVBoxLayout(self.central_widget)
        
        # Tabs
        self.tabs = QTabWidget()
        self.education_manager_widget = EducationManagerWidget(ERPClient(headless=True)) # Pass client
        # Note: EducationManagerWidget creates its own ERPClient or we pass one? 
        # The previous code passed nothing to MissingMemoWidget constructor, but inside it used self.erp.
        # Wait, MissingMemoWidget.__init__ took NO arguments in previous code?
        # Let's check MissingMemoWidget definition I replaced.
        # "class EducationManagerWidget(QWidget): def __init__(self, erp_client):"
        # So I need to pass erp_client.
        # But wait, MissingMemoWidget previously instantiated Worker which instantiated ERPClient.
        # In my NEW EducationManagerWidget, I used "self.erp = erp_client".
        # So I MUST pass an ERPClient instance.
        # However, MainWindow doesn't have one ready.
        # I should probably instantiate one here.
        
        self.erp_client = ERPClient(headless=True)
        self.education_manager_widget = EducationManagerWidget(self.erp_client)
        self.reservation_widget = ReservationCollectorWidget(self.erp_client)
        self.settings_widget = SettingsWidget()
        
        self.tabs.addTab(self.education_manager_widget, "교육관리")
        self.tabs.addTab(self.reservation_widget, "예약 수집")
        
        self.tabs.addTab(self.settings_widget, "설정")
        
        self.layout.addWidget(self.tabs)
        
        # Connect signals
        # EducationManagerWidget doesn't have notification_requested signal defined in my replacement?
        # I removed it in the replacement! I need to add it back or remove connection.
        # The previous MissingMemoWidget had it.
        # Let's remove the connection for now to avoid errors, or add it back to EducationManagerWidget.
        # I'll remove it for now as I didn't implement it in the new class.
        # self.missing_memo_widget.notification_requested.connect(self.show_notification)
        # self.missing_memo_widget.window_requested.connect(self.show_window)
        
        # Tray
        self.init_tray()
        
    def init_tray(self):
        self.tray_icon = QSystemTrayIcon(self)
        style = self.style()
        icon = style.standardIcon(style.StandardPixmap.SP_ComputerIcon)
        self.tray_icon.setIcon(icon)
        self.tray_icon.setToolTip("운영고수")
        
        menu = QMenu()
        show_action = QAction("열기", self)
        show_action.triggered.connect(self.show_window)
        menu.addAction(show_action)
        
        check_action = QAction("지금 확인", self)
        # Connect to the missing memo widget's check function
        check_action.triggered.connect(self.education_manager_widget.run_check)
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
        self.tray_icon.showMessage("운영고수", message, icon, 3000)

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
                self.tray_icon.showMessage("운영고수", "프로그램이 트레이로 최소화되었습니다.", QSystemTrayIcon.MessageIcon.Information, 2000)
        super().changeEvent(event)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyleSheet(GLOBAL_STYLESHEET)
    app.setQuitOnLastWindowClosed(True) # Quit when window closes
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
