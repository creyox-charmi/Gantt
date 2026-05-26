import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Make the Task Row overflow visible if it's being edited
content = content.replace(
    '''<div class="o_ug_row" t-att-style="'height: '+state.config.gantt_row_height+'px; width: max-content; min-width: 100%;'" t-on-mouseenter="() => this.onPEnter(t)" t-on-mouseleave="this.onPLeave" t-att-class="{ 'o_ug_row_hover': state.hId === t.id }" t-on-contextmenu.prevent="(ev) => this.onContextMenu(ev, t)">''',
    '''<div class="o_ug_row" t-att-style="'height: '+state.config.gantt_row_height+'px; width: max-content; min-width: 100%; ' + (state.editingCell && state.editingCell.id === t.id ? 'overflow: visible !important; z-index: 999;' : '')" t-on-mouseenter="() => this.onPEnter(t)" t-on-mouseleave="this.onPLeave" t-att-class="{ 'o_ug_row_hover': state.hId === t.id }" t-on-contextmenu.prevent="(ev) => this.onContextMenu(ev, t)">'''
)

# And ensure sidebar col doesn't clip
content = content.replace(
    '''class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative; overflow: visible;"''',
    '''class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative; overflow: visible !important;"'''
)
content = content.replace(
    '''class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px; position: relative; overflow: visible;"''',
    '''class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px; position: relative; overflow: visible !important;"'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed clipping issue!")
