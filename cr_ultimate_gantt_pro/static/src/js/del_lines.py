with open('ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# indices 1566 to 2054 are lines 1567 to 2055
del lines[1566:2055]

with open('ultimate_gantt_bundle.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
