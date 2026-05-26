import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_cols = [
    ("actual_effort", "ACTUAL EFFORT", "number"),
    ("baseline_duration", "BASELINE DURATION", "number"),
    ("baseline_effort", "BASELINE EFFORT", "number"),
    ("baseline_finish", "BASELINE FINISH", "date"),
    ("baseline_start", "BASELINE START", "date"),
    ("duration_variance", "DURATION VARIANCE", "readonly"),
    ("early_end", "EARLY END", "readonly"),
    ("early_start", "EARLY START", "readonly"),
    ("effort", "EFFORT", "number"),
    ("finish", "FINISH", "date"),
    ("finish_variance", "FINISH VARIANCE", "readonly"),
    ("ignore_resource_calendar", "IGNORE RES. CAL", "boolean"),
    ("inactive", "INACTIVE", "boolean"),
    ("info", "INFO", "readonly"),
    ("late_end", "LATE END", "readonly"),
    ("late_start", "LATE START", "readonly"),
    ("manually_scheduled", "MANUAL SCHED", "boolean"),
    ("milestone", "MILESTONE", "boolean"),
    ("note", "NOTE", "text"),
    ("planned_percent_done", "PLANNED %", "number"),
    ("rollup", "ROLLUP", "boolean"),
    ("scheduling_direction", "SCHED DIRECTION", "select", [('asap', 'As Soon As Possible'), ('alap', 'As Late As Possible')]),
    ("show_in_timeline", "TIMELINE", "boolean"),
    ("start_variance", "START VARIANCE", "readonly"),
    ("total_slack", "TOTAL SLACK", "readonly")
]

task_injection = ""

for row in new_cols:
    c_id = row[0]
    input_type = row[2]
    
    if input_type == 'readonly':
        task_injection += f"""                                     <div t-if="state.config.gantt_show_{c_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{c_id}}}}}px;"><t t-esc="t.{c_id} || '-'"/></div>\n"""
        continue

    new_block = f"""                                     <div t-if="state.config.gantt_show_{c_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{c_id}}}}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, '{c_id}')">\n"""
    new_block += f"""                                         <t t-if="state.editingCell && state.editingCell.id === t.id && state.editingCell.field === '{c_id}'">\n"""
    
    if input_type == 'date':
        new_block += f"""                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => {{ state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }}"/>\n"""
        display = f"""<t t-esc="t.{c_id} ? t.{c_id}.split(' ')[0] : '-'"/>"""
    elif input_type == 'number':
        new_block += f"""                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>\n"""
        display = f"""<t t-esc="t.{c_id} || '-'"/>"""
    elif input_type == 'text':
        new_block += f"""                                             <input type="text" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>\n"""
        display = f"""<t t-esc="t.{c_id} || '-'"/>"""
    elif input_type == 'boolean':
        new_block += f"""                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>\n"""
        display = f"""<input type="checkbox" t-att-checked="t.{c_id}" disabled="1" style="opacity: 0.8;"/>"""
    elif input_type == 'select':
        new_block += f"""                                             <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">\n"""
        for val, label in row[3]:
            new_block += f"""                                                 <option value="{val}">{label}</option>\n"""
        new_block += f"""                                             </select>\n"""
        display = f"""<t t-esc="t.{c_id} || '-'"/>"""

    new_block += f"""                                         </t>\n"""
    new_block += f"""                                         <t t-else="">\n"""
    new_block += f"""                                             {display}\n"""
    new_block += f"""                                         </t>\n"""
    new_block += f"""                                     </div>\n"""
    task_injection += new_block

target_block = '''                                         <t t-else="">
                                             <t t-esc="t.date_deadline ? t.date_deadline.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>'''

content = content.replace(target_block, target_block + '\n' + task_injection)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching editable columns (v2) successful!")
