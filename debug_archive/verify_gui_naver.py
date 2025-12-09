import sys
import unittest
from PyQt6.QtWidgets import QApplication
from gui import MainWindow, ReservationCollectorWidget

# Create QApplication instance if it doesn't exist
app = QApplication.instance()
if not app:
    app = QApplication(sys.argv)

class TestNaverGUI(unittest.TestCase):
    def setUp(self):
        self.window = MainWindow()
        self.widget = self.window.reservation_widget
        
    def test_widget_structure(self):
        # Check if widget is instance of ReservationCollectorWidget
        self.assertIsInstance(self.widget, ReservationCollectorWidget)
        
        # Check buttons
        self.assertTrue(hasattr(self.widget, 'btn_naver_login'))
        self.assertTrue(hasattr(self.widget, 'btn_collect'))
        
        # Check table
        self.assertTrue(hasattr(self.widget, 'table'))
        self.assertEqual(self.widget.table.columnCount(), 4)
        self.assertEqual(self.widget.table.horizontalHeaderItem(0).text(), "출처")
        
    def test_button_connections(self):
        # Verify buttons are connected (basic check)
        # We can't easily check signal connections in unittest without emitting, 
        # but we can check if the methods exist
        self.assertTrue(hasattr(self.widget, 'run_naver_login'))
        self.assertTrue(hasattr(self.widget, 'run_collect'))

if __name__ == '__main__':
    unittest.main()
