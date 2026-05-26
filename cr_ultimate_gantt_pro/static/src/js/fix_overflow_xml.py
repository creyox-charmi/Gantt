import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the invalid XML in t-att-style
content = content.replace(
    "(state.editingCell && state.editingCell.id === t.id ? 'overflow: visible !important; z-index: 999;' : '')",
    "(state.editingCell &amp;&amp; state.editingCell.id === t.id ? 'overflow: visible !important; z-index: 999;' : '')"
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed XML &amp;&amp; in t-att-style!")
