import unittest
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.date_filter import is_within_last_6_months

class TestDateFilter(unittest.TestCase):
    def setUp(self):
        self.today = datetime.now().date()
        self.six_months_ago = self.today - relativedelta(months=6)

    def test_valid_formats(self):
        # Test YYYY-MM-DD
        self.assertTrue(is_within_last_6_months(self.today.strftime("%Y-%m-%d")))
        # Test YYYY.MM.DD
        self.assertTrue(is_within_last_6_months(self.today.strftime("%Y.%m.%d")))
        # Test YYYY/MM/DD
        self.assertTrue(is_within_last_6_months(self.today.strftime("%Y/%m/%d")))

    def test_boundary_conditions(self):
        # Exactly 6 months ago
        self.assertTrue(is_within_last_6_months(self.six_months_ago.strftime("%Y-%m-%d")))
        
        # 6 months + 1 day ago (Should be False)
        one_day_before = self.six_months_ago - timedelta(days=1)
        self.assertFalse(is_within_last_6_months(one_day_before.strftime("%Y-%m-%d")))
        
        # Tomorrow (Should be False - future dates not "within last 6 months" strictly speaking, 
        # but usually we care about the start bound. 
        # The implementation checks <= today, so future is False)
        tomorrow = self.today + timedelta(days=1)
        self.assertFalse(is_within_last_6_months(tomorrow.strftime("%Y-%m-%d")))

    def test_invalid_inputs(self):
        self.assertFalse(is_within_last_6_months("invalid-date"))
        self.assertFalse(is_within_last_6_months(""))
        self.assertFalse(is_within_last_6_months(None))
        self.assertFalse(is_within_last_6_months("2020-13-45"))

if __name__ == '__main__':
    unittest.main()
