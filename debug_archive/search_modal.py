
with open("modal.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

targets = ["CalenderModalNew", "view_date", "memo_area", "fc_edit", "CalenderModalEdit"]

for i, line in enumerate(lines):
    for target in targets:
        if target in line:
            print(f"Found {target} at line {i+1}: {line.strip()[:100]}")
