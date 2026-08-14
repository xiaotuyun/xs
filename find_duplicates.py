with open('server.ts', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "app.post(" in line or "app.get(" in line:
        print(f"Line {idx+1}: {line.strip()}")
