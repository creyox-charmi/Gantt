import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the invalid XML '&&' -> '&amp;&amp;'
content = content.replace(
    'state.editingCell && state.editingCell.id === t.id && state.editingCell.field',
    'state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed invalid XML characters!")
