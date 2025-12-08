import sys
import unittest
from PyQt6.QtWidgets import QApplication, QListWidgetItem
from gui import MainWindow

# Create QApplication instance if it doesn't exist
app = QApplication.instance()
if not app:
    app = QApplication(sys.argv)

class TestGuiDelete(unittest.TestCase):
    def setUp(self):
        self.window = MainWindow()
        self.widget = self.window.missing_memo_widget
        # Mock data
        self.widget.missing_list = [
            {'name': 'User1', 'time': '10:00', 'index': 1},
            {'name': 'User2', 'time': '11:00', 'index': 2},
            {'name': 'User3', 'time': '12:00', 'index': 3}
        ]
        self.widget.drafts = {1: "Draft1", 2: "Draft2"}
        
        # Populate list widget
        for item in self.widget.missing_list:
            self.widget.list_widget.addItem(f"{item['name']} - {item['time']}")

    def test_delete_selected(self):
        # Select first and third item (indices 0 and 2)
        item0 = self.widget.list_widget.item(0)
        item2 = self.widget.list_widget.item(2)
        item0.setSelected(True)
        item2.setSelected(True)
        
        # Initial state
        self.assertEqual(len(self.widget.missing_list), 3)
        self.assertEqual(self.widget.list_widget.count(), 3)
        self.assertIn(1, self.widget.drafts)
        
        # Action
        self.widget.delete_selected_items()
        
        # Assertions
        self.assertEqual(len(self.widget.missing_list), 1)
        self.assertEqual(self.widget.list_widget.count(), 1)
        self.assertEqual(self.widget.missing_list[0]['name'], 'User2') # User2 should remain
        self.assertNotIn(1, self.widget.drafts) # Draft for User1 should be gone
        self.assertIn(2, self.widget.drafts) # Draft for User2 should remain

    def test_delete_all(self):
        # Mock confirmation dialog to return Yes
        # Since we can't easily mock QMessageBox static methods without patching, 
        # we will just call the logic directly or patch QMessageBox.
        # For simplicity, let's just test the logic if we assume confirmation passed.
        # But delete_all_items has the dialog inside.
        # We can mock QMessageBox.question
        
        from PyQt6.QtWidgets import QMessageBox
        from unittest.mock import patch
        
        with patch.object(QMessageBox, 'question', return_value=QMessageBox.StandardButton.Yes):
            self.widget.delete_all_items()
            
        self.assertEqual(len(self.widget.missing_list), 0)
        self.assertEqual(self.widget.list_widget.count(), 0)
        self.assertEqual(len(self.widget.drafts), 0)
        self.assertFalse(self.widget.btn_send_all.isEnabled())

if __name__ == '__main__':
    unittest.main()
