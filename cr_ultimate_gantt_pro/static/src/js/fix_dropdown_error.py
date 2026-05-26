import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Ensure val is always an array in startCellEdit
old_startCellEdit = '''    startCellEdit(task, field) {
        if (!this.state.config.gantt_enable_cell_editing) return;
        if (task.id.toString().startsWith('proj_')) return;
        let val = task[field];
        if (field.includes('date')) val = (val || '').split(' ')[0];
        this.state.editingCell = { id: task.id, field, val, original: task[field] };'''

new_startCellEdit = '''    startCellEdit(task, field) {
        if (!this.state.config.gantt_enable_cell_editing) return;
        if (task.id.toString().startsWith('proj_')) return;
        let val = task[field];
        if (field.includes('date')) val = (val || '').split(' ')[0];
        if (field === 'depend_on_ids' || field === 'dependent_ids') val = Array.isArray(val) ? [...val] : [];
        this.state.editingCell = { id: task.id, field, val, original: task[field] };'''

content = content.replace(old_startCellEdit, new_startCellEdit)

# Fix 2: Safe length checking in XML
content = content.replace('state.editingCell.val.length', '(state.editingCell.val &amp;&amp; state.editingCell.val.length)')
content = content.replace('state.editingCell.val.includes', '(state.editingCell.val &amp;&amp; state.editingCell.val.includes)')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed array length error successfully!")
