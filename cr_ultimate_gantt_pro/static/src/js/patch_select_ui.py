import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace Scheduling Mode block
old_mode = '''<div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.mode}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'scheduling_mode')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'scheduling_mode'">
                                             <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                 <option value="normal">Normal</option>
                                                 <option value="fixed_units">Fixed Units</option>
                                                 <option value="fixed_duration">Fixed Duration</option>
                                                 <option value="fixed_effort">Fixed Effort</option>
                                             </select>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.scheduling_mode || 'normal'"/>
                                         </t>
                                     </div>'''

new_mode = '''<div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.mode}}px; position: relative; overflow: visible !important;" t-on-dblclick="() => this.startCellEdit(t, 'scheduling_mode')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'scheduling_mode'">
                                             <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="this.commitCellEdit"></div>
                                             <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; border: 2px solid #017e84; background: white; z-index: 90;" tabindex="0" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                <span class="text-truncate px-1 fw-bold text-dark" style="font-size: 11px; text-transform: capitalize;"><t t-esc="state.editingCell.val ? state.editingCell.val.replace('_', ' ') : 'Normal'"/></span>
                                                <i class="fa fa-caret-down me-1 text-dark"/>
                                             </div>
                                             <div class="o_ug_dep_dropdown d-flex flex-column" style="position: absolute; top: 100%; left: 0; width: 160px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1050; border-radius: 4px; padding: 4px;">
                                                <div t-on-click="() => { state.editingCell.val = 'normal'; this.commitCellEdit(); }" class="p-2 rounded hover-bg-light" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #334155;">Normal</div>
                                                <div t-on-click="() => { state.editingCell.val = 'fixed_units'; this.commitCellEdit(); }" class="p-2 rounded hover-bg-light" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #334155;">Fixed Units</div>
                                                <div t-on-click="() => { state.editingCell.val = 'fixed_duration'; this.commitCellEdit(); }" class="p-2 rounded hover-bg-light" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #334155;">Fixed Duration</div>
                                                <div t-on-click="() => { state.editingCell.val = 'fixed_effort'; this.commitCellEdit(); }" class="p-2 rounded hover-bg-light" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #334155;">Fixed Effort</div>
                                             </div>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.scheduling_mode || 'normal'"/>
                                         </t>
                                     </div>'''

# 2. Replace Scheduling Direction block
old_dir = '''<div t-if="state.config.gantt_show_scheduling_direction" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.scheduling_direction}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'scheduling_direction')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'scheduling_direction'">
                                             <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                 <option value="asap">As Soon As Possible</option>
                                                 <option value="alap">As Late As Possible</option>
                                             </select>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.scheduling_direction || '-'"/>
                                         </t>
                                     </div>'''

new_dir = '''<div t-if="state.config.gantt_show_scheduling_direction" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.scheduling_direction}}px; position: relative; overflow: visible !important;" t-on-dblclick="() => this.startCellEdit(t, 'scheduling_direction')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'scheduling_direction'">
                                             <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="this.commitCellEdit"></div>
                                             <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; border: 2px solid #017e84; background: white; z-index: 90;" tabindex="0" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                <span class="text-truncate px-1 fw-bold text-dark" style="font-size: 11px;"><t t-esc="state.editingCell.val === 'alap' ? 'As Late As Possible' : 'As Soon As Possible'"/></span>
                                                <i class="fa fa-caret-down me-1 text-dark"/>
                                             </div>
                                             <div class="o_ug_dep_dropdown d-flex flex-column" style="position: absolute; top: 100%; left: 0; width: 180px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1050; border-radius: 4px; padding: 4px;">
                                                <div t-on-click="() => { state.editingCell.val = 'asap'; this.commitCellEdit(); }" class="p-2 rounded hover-bg-light" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #334155;">As Soon As Possible</div>
                                                <div t-on-click="() => { state.editingCell.val = 'alap'; this.commitCellEdit(); }" class="p-2 rounded hover-bg-light" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #334155;">As Late As Possible</div>
                                             </div>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.scheduling_direction || '-'"/>
                                         </t>
                                     </div>'''

content = content.replace(old_mode, new_mode)
content = content.replace(old_dir, new_dir)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced native selects with custom dropdowns!")
