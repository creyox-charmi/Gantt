import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the XML includes (remove all nested corruptions)
content = re.sub(
    r't-att-checked="[^"]*state\.editingCell\.val\.includes[^"]*\(tt\.id\)[^"]*"',
    r't-att-checked="state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id)"',
    content
)

# Fix the JS includes
content = re.sub(
    r'if \(!this\.\(?[^)]*state\.editingCell\.val\.includes\)?\(id\)\)',
    r'if (!this.state.editingCell.val.includes(id))',
    content
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Nuclear syntax fix applied!")
