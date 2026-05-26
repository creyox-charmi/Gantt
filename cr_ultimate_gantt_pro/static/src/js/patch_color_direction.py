import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Make the color dropdown drop UP instead of DOWN
content = content.replace(
    '''<div t-if="state.colorDropdownOpen" class="position-absolute bg-white border border-secondary shadow-sm" style="top: 100%; right: 0; width: 220px; z-index: 1060; border-radius: 8px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px;">''',
    '''<div t-if="state.colorDropdownOpen" class="position-absolute bg-white border border-secondary shadow-sm" style="bottom: 100%; margin-bottom: 4px; right: 0; width: 220px; z-index: 1060; border-radius: 8px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px;">'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Color dropdown direction inverted to prevent modal clipping!")
