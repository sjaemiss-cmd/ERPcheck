import re

def analyze():
    try:
        with open("naver_dump.html", "r", encoding="utf-8") as f:
            content = f.read()
            
        print(f"File size: {len(content)} bytes")
        
        # Check for iframes
        iframes = re.findall(r"<iframe[^>]*>", content)
        print(f"Found {len(iframes)} iframes.")
        for iframe in iframes:
            print(f"Iframe: {iframe}")
            
        # Check for user name
        if "홍재영" in content:
            print("Found '홍재영' in content!")
            # Print context
            idx = content.find("홍재영")
            start = max(0, idx - 200)
            end = min(len(content), idx + 200)
            print(f"Context: ...{content[start:end]}...")
        else:
            print("'홍재영' not found in content.")
            
        # Check for Status class
        matches = re.findall(r"class=\"([^\"]*BookingListView__state[^\"]*)\"", content)
        print(f"Found {len(matches)} elements with BookingListView__state.")
        if matches:
            print(f"Status classes: {matches[:5]}")

        # Check for Date/Time (look for text like '오전' or '오후')
        if "오전" in content or "오후" in content:
            print("Found time indicators (오전/오후).")
            # Find context for time
            idx = content.find("오전")
            if idx == -1: idx = content.find("오후")
            start = max(0, idx - 100)
            end = min(len(content), idx + 100)
            print(f"Time Context: ...{content[start:end]}...")
            
        # Check for Usage Date (User example: 12. 10.(수) 오전 9:00)
        # We'll search for "12. 10" or "오전 9:00" and see the container
        if "12. 10" in content:
            print("Found usage date '12. 10' in content.")
            idx = content.find("12. 10")
            start = max(0, idx - 150)
            end = min(len(content), idx + 150)
            print(f"Usage Date Context: ...{content[start:end]}...")
            
        # Check for Product Name (User example: 1,2종 면허 취득)
        if "1,2종 면허 취득" in content:
            print("Found product name '1,2종 면허 취득' in content.")
            idx = content.find("1,2종 면허 취득")
            start = max(0, idx - 150)
            end = min(len(content), idx + 150)
            print(f"Product Name Context: ...{content[start:end]}...")

            
        # Check for Request/Option classes
        # Look for 'BookingListView__option' or 'BookingListView__request' or similar
        matches = re.findall(r"class=\"([^\"]*BookingListView__[^\"]*)\"", content)
        # Filter for likely candidates
        candidates = [m for m in matches if 'option' in m or 'request' in m or 'memo' in m]
        print(f"Found {len(candidates)} potential request/option classes.")
        if candidates:
            print(f"Candidates: {list(set(candidates))[:10]}")
            
        # Search for Phone Number (User example: 010-9370-9190)
        if "010-" in content:
             print("Found '010-' in content.")
             idx = content.find("010-")
             start = max(0, idx - 150)
             end = min(len(content), idx + 150)
             print(f"Phone Number Context: ...{content[start:end]}...")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    analyze()
