import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update t-if for the 5 existing columns in THEAD (Lines ~537-542)
content = content.replace('<div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.progress}}px;', '<div t-if="state.config.gantt_show_progress" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.progress}}px;')
content = content.replace('<div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.pred}}px;', '<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.pred}}px;')
content = content.replace('<div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.succ}}px;', '<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.succ}}px;')
content = content.replace('<div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.cal}}px;', '<div t-if="state.config.gantt_show_calendar" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.cal}}px;')
content = content.replace('<div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.constr}}px;', '<div t-if="state.config.gantt_show_constraint_type" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.constr}}px;')

# Update t-if for the 5 existing columns in Project Row (Lines ~562-567)
content = content.replace('<div class="o_ug_sidebar_col opacity-50 fw-bold text-primary" t-attf-style="width: {{state.colWidths.progress}}px;">', '<div t-if="state.config.gantt_show_progress" class="o_ug_sidebar_col opacity-50 fw-bold text-primary" t-attf-style="width: {{state.colWidths.progress}}px;">')
content = content.replace('<div class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.pred}}px;">-</div>', '<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.pred}}px;">-</div>')
content = content.replace('<div class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.succ}}px;">-</div>', '<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.succ}}px;">-</div>')
content = content.replace('<div class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.cal}}px;">Standard</div>', '<div t-if="state.config.gantt_show_calendar" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.cal}}px;">Standard</div>')
content = content.replace('<div class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.constr}}px;">-</div>', '<div t-if="state.config.gantt_show_constraint_type" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.constr}}px;">-</div>')

# Update t-if for the 5 existing columns in Task Row (Lines ~613-640)
content = content.replace('<div class="o_ug_sidebar_col opacity-75 fw-bold text-primary" t-attf-style="width: {{state.colWidths.progress}}px; position: relative;"', '<div t-if="state.config.gantt_show_progress" class="o_ug_sidebar_col opacity-75 fw-bold text-primary" t-attf-style="width: {{state.colWidths.progress}}px; position: relative;"')
content = content.replace('<div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px;">', '<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px;">')
content = content.replace('<div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px;">', '<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px;">')
content = content.replace('<div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.cal}}px;">', '<div t-if="state.config.gantt_show_calendar" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.cal}}px;">')
content = content.replace('<div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.constr}}px; position: relative;"', '<div t-if="state.config.gantt_show_constraint_type" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.constr}}px; position: relative;"')

# Generate the 25 new columns
new_cols = [
    ("actual_effort", "ACTUAL EFFORT"),
    ("baseline_duration", "BASELINE DURATION"),
    ("baseline_effort", "BASELINE EFFORT"),
    ("baseline_finish", "BASELINE FINISH"),
    ("baseline_start", "BASELINE START"),
    ("duration_variance", "DURATION VARIANCE"),
    ("early_end", "EARLY END"),
    ("early_start", "EARLY START"),
    ("effort", "EFFORT"),
    ("finish", "FINISH"),
    ("finish_variance", "FINISH VARIANCE"),
    ("ignore_resource_calendar", "IGNORE RES. CAL"),
    ("inactive", "INACTIVE"),
    ("info", "INFO"),
    ("late_end", "LATE END"),
    ("late_start", "LATE START"),
    ("manually_scheduled", "MANUAL SCHED"),
    ("milestone", "MILESTONE"),
    ("note", "NOTE"),
    ("planned_percent_done", "PLANNED %"),
    ("rollup", "ROLLUP"),
    ("scheduling_direction", "SCHED DIRECTION"),
    ("show_in_timeline", "TIMELINE"),
    ("start_variance", "START VARIANCE"),
    ("total_slack", "TOTAL SLACK")
]

header_injection = ""
proj_injection = ""
task_injection = ""
state_col_widths = []

for c_id, c_label in new_cols:
    width = 80 if c_id not in ['note'] else 150
    state_col_widths.append(f"{c_id}: {width}")
    
    header_injection += f"""                                         <div t-if="state.config.gantt_show_{c_id}" class="o_ug_sidebar_col" t-attf-style="width: {{{{state.colWidths.{c_id}}}}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">{c_label} <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, '{c_id}')"></div></div>\n"""
    
    proj_injection += f"""                                     <div t-if="state.config.gantt_show_{c_id}" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{{{state.colWidths.{c_id}}}}}px;">-</div>\n"""
    
    if c_id in ['baseline_start', 'baseline_finish', 'early_start', 'early_end', 'late_start', 'late_end', 'finish']:
        task_injection += f"""                                     <div t-if="state.config.gantt_show_{c_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{c_id}}}}}px;"><t t-esc="t.{c_id} ? t.{c_id}.split(' ')[0] : '-'"/></div>\n"""
    else:
        task_injection += f"""                                     <div t-if="state.config.gantt_show_{c_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{c_id}}}}}px;"><t t-esc="t.{c_id} || '-'"/></div>\n"""

# Inject Header
content = content.replace(
    '''<div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.deadline}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">DEADLINE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'deadline')"></div></div>''',
    '''<div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.deadline}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">DEADLINE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'deadline')"></div></div>\n''' + header_injection
)

# Inject Project Row
content = content.replace(
    '''<div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.deadline}}px;"><t t-esc="p.date_deadline ? p.date_deadline.split(' ')[0] : '-'"/></div>''',
    '''<div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.deadline}}px;"><t t-esc="p.date_deadline ? p.date_deadline.split(' ')[0] : '-'"/></div>\n''' + proj_injection
)

# Inject Task Row
content = content.replace(
    '''<div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.deadline}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'date_deadline')">\n                                         <t t-if="state.editingCell && state.editingCell.id === t.id && state.editingCell.field === 'date_deadline'">\n                                             <input type="date" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>\n                                         </t>\n                                         <t t-else="">\n                                             <t t-esc="t.date_deadline ? t.date_deadline.split(' ')[0] : '-'"/>\n                                         </t>\n                                     </div>''',
    '''<div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.deadline}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'date_deadline')">\n                                         <t t-if="state.editingCell && state.editingCell.id === t.id && state.editingCell.field === 'date_deadline'">\n                                             <input type="date" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>\n                                         </t>\n                                         <t t-else="">\n                                             <t t-esc="t.date_deadline ? t.date_deadline.split(' ')[0] : '-'"/>\n                                         </t>\n                                     </div>\n''' + task_injection
)

# Add to state.colWidths
state_col_str = ", ".join(state_col_widths)
content = content.replace(
    "status: 60, complex: 60, deadline: 80",
    f"status: 60, complex: 60, deadline: 80, {state_col_str}"
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch successful!")
