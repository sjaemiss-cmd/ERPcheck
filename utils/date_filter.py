from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

def is_within_last_6_months(date_str):
    """
    Checks if the given date string is within the last 6 months from today.
    Supports formats: 'YYYY-MM-DD', 'YYYY.MM.DD', 'YYYY/MM/DD'
    """
    if not date_str:
        return False
        
    # Normalize separators
    date_str = date_str.replace('.', '-').replace('/', '-')
    
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return False
        
    today = datetime.now().date()
    six_months_ago = today - relativedelta(months=6)
    
    return six_months_ago <= target_date <= today
