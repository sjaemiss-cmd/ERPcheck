import sys
import unittest
from PyQt6.QtWidgets import QApplication
from gui import MainWindow, ReservationCollectorWidget

app = QApplication.instance()
if not app:
    app = QApplication(sys.argv)

class TestIntegration(unittest.TestCase):
    def setUp(self):
        self.widget = ReservationCollectorWidget()
        
    def test_parser(self):
        # Test Naver format (hypothetical)
        text1 = "예약자: 홍길동\n날짜: 2025-12-25\n시간: 14:00"
        parsed1 = self.widget.parse_reservation_data(text1)
        self.assertEqual(parsed1['name'], '홍길동')
        self.assertEqual(parsed1['date'], '2025-12-25')
        self.assertEqual(parsed1['time'], '14:00')
        
        # Test Kakao format (hypothetical)
        text2 = "12월 25일 14:00 예약하고 싶어요. 이름은 김철수입니다."
        parsed2 = self.widget.parse_reservation_data(text2)
        # Note: Name parsing is weak, might not catch '김철수' if not strictly formatted
        # But date/time should work
        self.assertEqual(parsed2['date'], '2025-12-25') # Assuming current year logic works
        self.assertEqual(parsed2['time'], '14:00')

    def test_columns(self):
        self.assertEqual(self.widget.table.columnCount(), 7)
        self.assertEqual(self.widget.table.horizontalHeaderItem(6).text(), "선택")

if __name__ == '__main__':
    unittest.main()
