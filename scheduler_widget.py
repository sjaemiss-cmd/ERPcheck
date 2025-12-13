import sys
import datetime
import re
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGraphicsView, QGraphicsScene, 
    QGraphicsRectItem, QGraphicsItem, QApplication, QLabel, QFrame,
    QScrollBar, QGraphicsTextItem
)
from PyQt6.QtCore import Qt, QRectF, pyqtSignal, QPointF
from PyQt6.QtGui import QBrush, QPen, QColor, QFont, QPainter

# --- Constants ---
START_HOUR = 9
END_HOUR = 22
HOUR_HEIGHT = 60  # 1 hour = 60px
MINUTE_HEIGHT = HOUR_HEIGHT / 60
SLOT_HEIGHT = 30  # 30 mins = 30px (Snap unit)
COLUMN_WIDTH = 60
NUM_DAYS = 14 # Changed to 14 days as requested
COLS_PER_DAY = 6  # 1~5호기 + 상담
TOTAL_COLS = NUM_DAYS * COLS_PER_DAY
TOTAL_HOURS = END_HOUR - START_HOUR
SCENE_WIDTH = TOTAL_COLS * COLUMN_WIDTH
SCENE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT

# Colors
COLOR_BG_CONSULTATION = QColor("#FFFFE0")
COLOR_GRID_LINE = QColor("#D0D0D0")
COLOR_GRID_DASHED = QColor("#E0E0E0")
COLOR_DAY_SEPARATOR = QColor("#000000")
COLOR_ITEM_BG = QColor("#3B8ED0")
COLOR_ITEM_TEXT = QColor("#FFFFFF")
COLOR_HANDLE = QColor("#FFFFFF")

class ReservationItem(QGraphicsRectItem):
    """
    A draggable and resizable reservation block.
    Snaps to 30-minute grid (30px).
    """
    def __init__(self, x, y, width, height, title="예약"):
        super().__init__(0, 0, width, height)
        self.setPos(x, y)
        self.setBrush(QBrush(COLOR_ITEM_BG))
        self.setPen(QPen(Qt.PenStyle.NoPen))
        self.setFlags(
            QGraphicsItem.GraphicsItemFlag.ItemIsMovable |
            QGraphicsItem.GraphicsItemFlag.ItemIsSelectable |
            QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges
        )
        self.title = title
        self.setAcceptHoverEvents(True)
        self.resizing = False
        self.resize_handle_size = 10

        # Text Label
        self.text_item = QGraphicsTextItem(title, self)
        self.text_item.setDefaultTextColor(COLOR_ITEM_TEXT)
        self.text_item.setPos(5, 5)

    def paint(self, painter, option, widget=None):
        super().paint(painter, option, widget)
        # Draw resize handle at bottom right
        if self.isSelected() or self.isUnderMouse():
            painter.setBrush(QBrush(COLOR_HANDLE))
            painter.setPen(QPen(Qt.GlobalColor.black, 1))
            rect = self.rect()
            painter.drawRect(QRectF(
                rect.width() - self.resize_handle_size,
                rect.height() - self.resize_handle_size / 2,
                self.resize_handle_size,
                self.resize_handle_size / 2
            ))

    def hoverMoveEvent(self, event):
        # Change cursor when hovering over bottom edge
        rect = self.rect()
        if event.pos().y() >= rect.height() - self.resize_handle_size:
            self.setCursor(Qt.CursorShape.SizeVerCursor)
        else:
            self.setCursor(Qt.CursorShape.ArrowCursor)
        super().hoverMoveEvent(event)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            rect = self.rect()
            if event.pos().y() >= rect.height() - self.resize_handle_size:
                self.resizing = True
                self.start_y = event.scenePos().y()
                self.start_height = rect.height()
                event.accept()
                return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self.resizing:
            diff = event.scenePos().y() - self.start_y
            new_height = self.start_height + diff
            # Snap height to SLOT_HEIGHT
            snapped_height = round(new_height / SLOT_HEIGHT) * SLOT_HEIGHT
            snapped_height = max(snapped_height, SLOT_HEIGHT) # Min height
            
            self.setRect(0, 0, self.rect().width(), snapped_height)
            return
        
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if self.resizing:
            self.resizing = False
            self.setCursor(Qt.CursorShape.ArrowCursor)
            # Ensure final snap
            rect = self.rect()
            snapped_height = round(rect.height() / SLOT_HEIGHT) * SLOT_HEIGHT
            snapped_height = max(snapped_height, SLOT_HEIGHT)
            self.setRect(0, 0, rect.width(), snapped_height)
            
        super().mouseReleaseEvent(event)

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionChange and self.scene():
            new_pos = value
            # Snap X to COLUMN_WIDTH
            x = round(new_pos.x() / COLUMN_WIDTH) * COLUMN_WIDTH
            # Snap Y to SLOT_HEIGHT
            y = round(new_pos.y() / SLOT_HEIGHT) * SLOT_HEIGHT
            
            # Constrain within scene
            x = max(0, min(x, SCENE_WIDTH - self.rect().width()))
            y = max(0, min(y, SCENE_HEIGHT - self.rect().height()))
            
            return QPointF(x, y)
        return super().itemChange(change, value)

class SchedulerScene(QGraphicsScene):
    """
    Custom scene to draw the grid background efficiently.
    """
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSceneRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)

    def drawBackground(self, painter, rect):
        # Fill white background
        painter.fillRect(rect, Qt.GlobalColor.white)
        
        # Draw Consultation Columns Background
        for day in range(NUM_DAYS):
            # The 6th column (index 5) is 'Consultation'
            col_idx = day * COLS_PER_DAY + 5
            x = col_idx * COLUMN_WIDTH
            bg_rect = QRectF(x, 0, COLUMN_WIDTH, SCENE_HEIGHT)
            # Intersect with update rect for performance
            if bg_rect.intersects(rect):
                painter.fillRect(bg_rect, COLOR_BG_CONSULTATION)

        # Draw Horizontal Lines (Time)
        pen_solid = QPen(COLOR_GRID_LINE, 1)
        pen_dashed = QPen(COLOR_GRID_DASHED, 1, Qt.PenStyle.DashLine)
        
        for i in range(TOTAL_HOURS + 1):
            y = i * HOUR_HEIGHT
            # Hour line (Solid)
            painter.setPen(pen_solid)
            painter.drawLine(0, y, SCENE_WIDTH, y)
            
            # 30 min line (Dashed)
            if i < TOTAL_HOURS:
                y_30 = y + 30
                painter.setPen(pen_dashed)
                painter.drawLine(0, y_30, SCENE_WIDTH, y_30)

        # Draw Vertical Lines (Columns)
        pen_col = QPen(COLOR_GRID_LINE, 1)
        pen_day = QPen(COLOR_DAY_SEPARATOR, 2)
        
        for i in range(TOTAL_COLS + 1):
            x = i * COLUMN_WIDTH
            if i % COLS_PER_DAY == 0:
                painter.setPen(pen_day) # Day separator
            else:
                painter.setPen(pen_col) # Normal column
            
            painter.drawLine(x, 0, x, SCENE_HEIGHT)

class TimeRulerWidget(QWidget):
    """
    Displays time labels on the left side.
    """
    def __init__(self):
        super().__init__()
        self.setFixedWidth(60)
        self.setFixedHeight(SCENE_HEIGHT) # Initial height, will be managed by scroll
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        font = QFont("Arial", 9)
        painter.setFont(font)
        
        for i in range(TOTAL_HOURS + 1):
            hour = START_HOUR + i
            y = i * HOUR_HEIGHT
            time_str = f"{hour:02d}:00"
            
            # Draw text centered vertically at the line
            rect = QRectF(0, y - 10, self.width() - 5, 20)
            painter.drawText(rect, Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter, time_str)

class HeaderWidget(QWidget):
    """
    Displays Date and Resource headers.
    """
    def __init__(self):
        super().__init__()
        self.setFixedHeight(60) # 2 rows of 30px
        self.setFixedWidth(SCENE_WIDTH)
        self.start_date = datetime.date.today()
        
    def set_start_date(self, date):
        self.start_date = date
        self.update()
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        
        # Draw Background
        painter.fillRect(self.rect(), QColor("#F0F0F0"))
        
        pen = QPen(COLOR_GRID_LINE)
        painter.setPen(pen)
        
        # Fonts
        font_date = QFont("Arial", 10, QFont.Weight.Bold)
        font_res = QFont("Arial", 9)
        
        days_kr = ["월", "화", "수", "목", "금", "토", "일"]
        resources = ["1호기", "2호기", "3호기", "4호기", "5호기", "상담"]
        
        for day in range(NUM_DAYS):
            day_x = day * COLS_PER_DAY * COLUMN_WIDTH
            day_width = COLS_PER_DAY * COLUMN_WIDTH
            
            # Calculate date
            current_date = self.start_date + datetime.timedelta(days=day)
            date_str = f"{current_date.month}/{current_date.day} ({days_kr[current_date.weekday()]})"
            
            # 1. Draw Date (Top Row)
            rect_date = QRectF(day_x, 0, day_width, 30)
            painter.setFont(font_date)
            painter.drawText(rect_date, Qt.AlignmentFlag.AlignCenter, date_str)
            painter.drawRect(rect_date) # Border
            
            # 2. Draw Resources (Bottom Row)
            painter.setFont(font_res)
            for col in range(COLS_PER_DAY):
                res_x = day_x + col * COLUMN_WIDTH
                rect_res = QRectF(res_x, 30, COLUMN_WIDTH, 30)
                painter.drawText(rect_res, Qt.AlignmentFlag.AlignCenter, resources[col])
                painter.drawRect(rect_res) # Border

class WeeklySchedulerWidget(QWidget):
    """
    Main Scheduler Widget assembling TimeRuler, Header, and GraphicsView.
    """
    def __init__(self):
        super().__init__()
        self.layout = QVBoxLayout(self)
        self.layout.setSpacing(0)
        self.layout.setContentsMargins(0, 0, 0, 0)
        
        # --- Top Area (Corner + Header) ---
        top_layout = QHBoxLayout()
        top_layout.setSpacing(0)
        top_layout.setContentsMargins(0, 0, 0, 0)
        
        # Corner Widget (Empty space above Time Ruler)
        corner = QWidget()
        corner.setFixedSize(60, 60)
        corner.setStyleSheet("background-color: #F0F0F0; border-bottom: 1px solid #D0D0D0; border-right: 1px solid #D0D0D0;")
        top_layout.addWidget(corner)
        
        # Header View (Viewport for HeaderWidget)
        self.header_view = QGraphicsView()
        self.header_view.setFixedHeight(60)
        self.header_view.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.header_view.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.header_view.setFrameShape(QFrame.Shape.NoFrame)
        self.header_view.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        
        self.header_scene = QGraphicsScene()
        self.header_widget = HeaderWidget()
        self.header_scene.addWidget(self.header_widget)
        self.header_view.setScene(self.header_scene)
        
        top_layout.addWidget(self.header_view)
        self.layout.addLayout(top_layout)
        
        # --- Main Area (Time Ruler + Scheduler) ---
        main_layout = QHBoxLayout()
        main_layout.setSpacing(0)
        main_layout.setContentsMargins(0, 0, 0, 0)
        
        # Time Ruler View
        self.ruler_view = QGraphicsView()
        self.ruler_view.setFixedWidth(60)
        self.ruler_view.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.ruler_view.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.ruler_view.setFrameShape(QFrame.Shape.NoFrame)
        self.ruler_view.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        
        self.ruler_scene = QGraphicsScene()
        self.ruler_widget = TimeRulerWidget()
        self.ruler_scene.addWidget(self.ruler_widget)
        self.ruler_view.setScene(self.ruler_scene)
        
        main_layout.addWidget(self.ruler_view)
        
        # Scheduler View
        self.scheduler_view = QGraphicsView()
        self.scheduler_scene = SchedulerScene()
        self.scheduler_view.setScene(self.scheduler_scene)
        self.scheduler_view.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        
        main_layout.addWidget(self.scheduler_view)
        self.layout.addLayout(main_layout)
        
        # --- Synchronization ---
        # Sync Horizontal Scroll (Header <-> Scheduler)
        self.scheduler_view.horizontalScrollBar().valueChanged.connect(
            self.header_view.horizontalScrollBar().setValue
        )
        
        # Sync Vertical Scroll (Ruler <-> Scheduler)
        self.scheduler_view.verticalScrollBar().valueChanged.connect(
            self.ruler_view.verticalScrollBar().setValue
        )

        self.start_date = datetime.date.today()
        self.header_widget.set_start_date(self.start_date)

    def update_schedule(self, events_list):
        """
        Updates the scheduler with a list of events.
        events_list: List of dicts (from ERP or Naver)
        """
        self.scheduler_scene.clear()
        
        # Update start date to today
        self.start_date = datetime.date.today()
        self.header_widget.set_start_date(self.start_date)
        
        for event in events_list:
            try:
                # Parse Start Time
                start_str = event.get('start')
                if not start_str: continue
                
                # Handle ISO format or simple date
                if 'T' in start_str:
                    s_dt = datetime.datetime.fromisoformat(start_str)
                else:
                    # If just date, skip? or all day?
                    continue
                
                # Parse End Time
                end_str = event.get('end')
                if end_str and 'T' in end_str:
                    e_dt = datetime.datetime.fromisoformat(end_str)
                else:
                    # Default 1 hour
                    e_dt = s_dt + datetime.timedelta(hours=1)
                
                # Calculate Day Index
                day_diff = (s_dt.date() - self.start_date).days
                if day_diff < 0 or day_diff >= NUM_DAYS:
                    continue
                
                # Calculate Resource Column
                title = event.get('title', '')
                col_offset = 5 # Default to Consultation
                
                if '1호기' in title or '1종' in title: col_offset = 0
                elif '2호기' in title or '2종' in title: col_offset = 1
                elif '3호기' in title: col_offset = 2
                elif '4호기' in title: col_offset = 3
                elif '5호기' in title: col_offset = 4
                elif '상담' in title: col_offset = 5
                
                # Calculate Coordinates
                x = (day_diff * COLS_PER_DAY + col_offset) * COLUMN_WIDTH
                
                start_hour = s_dt.hour + s_dt.minute / 60.0
                end_hour = e_dt.hour + e_dt.minute / 60.0
                
                if start_hour < START_HOUR: start_hour = START_HOUR
                if end_hour > END_HOUR: end_hour = END_HOUR
                
                y = (start_hour - START_HOUR) * HOUR_HEIGHT
                height = (end_hour - start_hour) * HOUR_HEIGHT
                
                if height <= 0: continue
                
                # Create Item
                item = ReservationItem(x, y, COLUMN_WIDTH, height, title)
                self.scheduler_scene.addItem(item)
                
            except Exception as e:
                print(f"Error adding event: {e}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = WeeklySchedulerWidget()
    window.resize(1000, 800)
    window.setWindowTitle("운영고수 주간 스케줄러")
    window.show()
    sys.exit(app.exec())
