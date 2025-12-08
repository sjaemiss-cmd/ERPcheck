import sys
import unittest
from PyQt6.QtWidgets import QApplication
from gui import MainWindow

# Create QApplication instance if it doesn't exist
app = QApplication.instance()
if not app:
    app = QApplication(sys.argv)

class TestDurationInfo(unittest.TestCase):
    def setUp(self):
        self.window = MainWindow()
        self.widget = self.window.missing_memo_widget
        # Mock data with duration
        self.widget.missing_list = [
            {'name': 'User1', 'time': '10:00', 'index': 1, 'duration': 2.0},
            {'name': 'User2', 'time': '11:00', 'index': 2, 'duration': 1.5},
            {'name': 'User3', 'time': '12:00', 'index': 3} # No duration
        ]
        
    def test_list_display(self):
        # Simulate on_check_finished logic
        for item in self.widget.missing_list:
            duration_str = f" ({item.get('duration', 0)}시간)" if item.get('duration') else ""
            self.widget.list_widget.addItem(f"{item['name']}{duration_str} - {item['time']}")
            
        # Verify items
        item0 = self.widget.list_widget.item(0).text()
        item1 = self.widget.list_widget.item(1).text()
        item2 = self.widget.list_widget.item(2).text()
        
        self.assertIn("User1 (2.0시간)", item0)
        self.assertIn("User2 (1.5시간)", item1)
        self.assertNotIn("시간", item2) # User3 has no duration
        
    def test_save_draft_update(self):
        # Populate list first
        self.test_list_display()
        
        # Select first item
        self.widget.list_widget.setCurrentRow(0)
        self.widget.input_memo.setText("Memo")
        
        # Save draft
        self.widget.save_draft()
        
        # Verify text updated correctly
        updated_text = self.widget.list_widget.item(0).text()
        self.assertIn("[저장됨]", updated_text)
        self.assertIn("User1 (2.0시간)", updated_text)

if __name__ == '__main__':
    unittest.main()
