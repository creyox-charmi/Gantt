import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

def make_editable(col_id, input_type, options=None):
    global content
    
    # Identify the original line to replace
    if col_id in ['baseline_start', 'baseline_finish', 'finish']:
        old_line = f"""                                     <div t-if="state.config.gantt_show_{col_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{col_id}}}}}px;"><t t-esc="t.{col_id} ? t.{col_id}.split(' ')[0] : '-'"/></div>"""
    else:
        old_line = f"""                                     <div t-if="state.config.gantt_show_{col_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{col_id}}}}}px;"><t t-esc="t.{col_id} || '-'"/></div>"""
        
    if old_line not in content:
        print(f"Warning: Could not find original line for {col_id}")
        return

    # Build the new editable block
    new_block = f"""                                     <div t-if="state.config.gantt_show_{col_id}" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{{{state.colWidths.{col_id}}}}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, '{col_id}')">\n"""
    new_block += f"""                                         <t t-if="state.editingCell && state.editingCell.id === t.id && state.editingCell.field === '{col_id}'">\n"""
    
    if input_type == 'date':
        new_block += f"""                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => {{ state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }}"/>\n"""
        display = f"""<t t-esc="t.{col_id} ? t.{col_id}.split(' ')[0] : '-'"/>"""
    elif input_type == 'number':
        new_block += f"""                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>\n"""
        display = f"""<t t-esc="t.{col_id} || '-'"/>"""
    elif input_type == 'text':
        new_block += f"""                                             <input type="text" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>\n"""
        display = f"""<t t-esc="t.{col_id} || '-'"/>"""
    elif input_type == 'boolean':
        new_block += f"""                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>\n"""
        display = f"""<input type="checkbox" t-att-checked="t.{col_id}" disabled="1" style="opacity: 0.8;"/>"""
    elif input_type == 'select':
        new_block += f"""                                             <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">\n"""
        for val, label in options:
            new_block += f"""                                                 <option value="{val}">{label}</option>\n"""
        new_block += f"""                                             </select>\n"""
        display = f"""<t t-esc="t.{col_id} || '-'"/>"""

    new_block += f"""                                         </t>\n"""
    new_block += f"""                                         <t t-else="">\n"""
    new_block += f"""                                             {display}\n"""
    new_block += f"""                                         </t>\n"""
    new_block += f"""                                     </div>"""

    content = content.replace(old_line, new_block)

# Apply configurations
make_editable('baseline_start', 'date')
make_editable('baseline_finish', 'date')
make_editable('finish', 'date')
make_editable('baseline_duration', 'number')
make_editable('baseline_effort', 'number')
make_editable('effort', 'number')
make_editable('actual_effort', 'number')
make_editable('planned_percent_done', 'number')
make_editable('note', 'text')
make_editable('ignore_resource_calendar', 'boolean')
make_editable('inactive', 'boolean')
make_editable('manually_scheduled', 'boolean')
make_editable('milestone', 'boolean')
make_editable('rollup', 'boolean')
make_editable('show_in_timeline', 'boolean')
make_editable('scheduling_direction', 'select', [('asap', 'As Soon As Possible'), ('alap', 'As Late As Possible')])

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching editable columns successful!")
