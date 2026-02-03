
import sys
import os
from datetime import datetime, timedelta

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from routes.analytics import get_revenue_date_config

def test_date_logic():
    print("[TEST] Testing Revenue Analytics Date Logic...")
    
    # Test Day (Hour buckets)
    config = get_revenue_date_config('day')
    print(f"\n[Day Range]")
    print(f"Start: {config['start']}")
    print(f"End:   {config['end']}")
    print(f"Bucket: {config['bucket']}")
    
    assert config['bucket'] == 'hour'
    assert (config['end'] - config['start']).total_seconds() >= 24 * 3600
    
    # Test Week (Day buckets)
    config = get_revenue_date_config('week')
    print(f"\n[Week Range]")
    print(f"Start: {config['start']}")
    print(f"End:   {config['end']}")
    
    assert config['bucket'] == 'day'
    assert (config['end'] - config['start']).days >= 7
    
    # Test Month (Day buckets)
    config = get_revenue_date_config('month')
    print(f"\n[Month Range]")
    print(f"Start: {config['start']}")
    
    assert (config['end'] - config['start']).days >= 30
    
    # Test Year (Month buckets)
    config = get_revenue_date_config('year')
    print(f"\n[Year Range]")
    print(f"Start: {config['start']}")
    print(f"Bucket: {config['bucket']}")
    
    assert config['bucket'] == 'month'
    
    print("\n[PASS] Date logic verification passed!")

if __name__ == "__main__":
    try:
        test_date_logic()
    except ImportError as e:
        print(f"[FAIL] Import failed: {e}")
        print("Make sure you are running from the project root")
    except Exception as e:
        print(f"[FAIL] Test failed: {e}")
