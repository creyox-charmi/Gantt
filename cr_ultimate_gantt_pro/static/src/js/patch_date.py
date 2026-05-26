import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add getLuxonDate method to UltimateGanttRenderer
method_injection = """
    getLuxonDate(dateStr) {
        if (!dateStr) return false;
        return luxon.DateTime.fromSQL(dateStr.split(' ')[0]);
    }
"""
content = content.replace(
    '''    openTaskEditor(t) {''',
    method_injection + '''    openTaskEditor(t) {'''
)

# 2. Replace <input type="date"> with DateTimeInput inside state.editingCell blocks
# There are 3 blocks currently: planned_date_begin, constraint_date, date_deadline
content = content.replace(
    '''<input type="date" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>''',
    '''<DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch successful!")
