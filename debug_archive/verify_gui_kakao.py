import sys
import unittest
from PyQt6.QtWidgets import QApplication
from gui import MainWindow, ReservationCollectorWidget

# Create QApplication instance if it doesn't exist
app = QApplication.instance()
if not app:
    app = QApplication(sys.argv)

class TestKakaoGUI(unittest.TestCase):
    def setUp(self):
        self.window = MainWindow()
        self.widget = self.window.reservation_widget
        
    def test_widget_structure(self):
        # Check buttons
        self.assertTrue(hasattr(self.widget, 'btn_naver_login'))
        self.assertTrue(hasattr(self.widget, 'btn_kakao_login')) # New button
import sys
import unittest
from PyQt6.QtWidgets import QApplication
from gui import MainWindow, ReservationCollectorWidget

# Create QApplication instance if it doesn't exist
app = QApplication.instance()
if not app:
    app = QApplication(sys.argv)

class TestKakaoGUI(unittest.TestCase):
    def setUp(self):
        self.window = MainWindow()
        self.widget = self.window.reservation_widget
        
    def test_widget_structure(self):
        # Check buttons
        self.assertTrue(hasattr(self.widget, 'btn_naver_login'))
        self.assertTrue(hasattr(self.widget, 'btn_kakao_login')) # New button
        self.assertTrue(hasattr(self.widget, 'btn_collect'))
        
    def test_button_connections(self):
        self.assertTrue(hasattr(self.widget, 'run_kakao_login'))
        self.assertTrue(hasattr(self.widget, 'on_kakao_login_finished'))

if __name__ == '__main__':
    unittest.main()
