import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the dropdown trigger to use a backdrop instead of t-on-blur with setTimeout
old_trigger = '''<div class="form-control form-control-sm border-secondary d-flex align-items-center justify-content-between shadow-none" style="border-radius: 6px; cursor: pointer; background: white;" tabindex="0" t-on-click="() => state.colorDropdownOpen = !state.colorDropdownOpen" t-on-blur="() => setTimeout(() => state.colorDropdownOpen = false, 200)">
                                                <div class="d-flex align-items-center">'''

new_trigger = '''<t t-if="state.colorDropdownOpen">
                                                <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="() => state.colorDropdownOpen = false"></div>
                                            </t>
                                            <div class="form-control form-control-sm border-secondary d-flex align-items-center justify-content-between shadow-none" style="border-radius: 6px; cursor: pointer; background: white; z-index: 1045; position: relative;" tabindex="0" t-on-click="() => state.colorDropdownOpen = !state.colorDropdownOpen">
                                                <div class="d-flex align-items-center">'''

content = content.replace(old_trigger, new_trigger)

# 2. Fix the CSS clipping by removing overflow-y: auto from o_ug_modal_body
content = content.replace(
    '.o_ug_modal_body { padding: 24px; overflow-y: auto; max-height: 70vh; background: #fff; }',
    '.o_ug_modal_body { padding: 24px; overflow: visible; max-height: 70vh; background: #fff; }'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed v200 TypeError and modal CSS clipping!")
