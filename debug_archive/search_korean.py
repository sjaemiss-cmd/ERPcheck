
with open("modal.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

target = "교육 및 메모사항"

for i, line in enumerate(lines):
    if target in line:
        print(f"Found at line {i+1}: {line.strip()}")
        # Print surrounding lines for context
        start = max(0, i - 5)
        end = min(len(lines), i + 10)
        for j in range(start, end):
            print(f"  {j+1}: {lines[j].strip()}")
        print("-" * 20)
