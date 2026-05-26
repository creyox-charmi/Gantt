import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add toggleDependency method to UltimateGanttRenderer
method_injection = """
    toggleDependency(id, checked) {
        if (!this.state.editingCell || !Array.isArray(this.state.editingCell.val)) return;
        if (checked) {
            if (!this.state.editingCell.val.includes(id)) this.state.editingCell.val.push(id);
        } else {
            this.state.editingCell.val = this.state.editingCell.val.filter(x => x !== id);
        }
    }
"""
content = content.replace(
    '''    openTaskEditor(t) {''',
    method_injection + '''    openTaskEditor(t) {'''
)

# 2. Replace predecessors block
old_pred_start = '''<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'depend_on_ids')">'''
old_pred_end = '''    <t t-else="">
        <t t-esc="t.predecessor_wbs || '-'"/>
    </t>
</div>'''

# We extract everything between old_pred_start and old_pred_end to replace it
# Wait, let's just use string replacement on the exact block we wrote earlier
old_pred_full = '''<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'depend_on_ids')">
    <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'depend_on_ids'">
        <select multiple="1" class="o_ug_cell_editor" style="height: auto; min-height: 80px; position: absolute; z-index: 100; top: 100%; left: 0; width: 100%;" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
            <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                <option t-if="tt.id !== t.id" t-att-value="tt.id"><t t-esc="tt.name"/></option>
            </t>
        </select>
    </t>
    <t t-else="">
        <t t-esc="t.predecessor_wbs || '-'"/>
    </t>
</div>'''

new_pred_full = '''<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative; overflow: visible;" t-on-dblclick="() => this.startCellEdit(t, 'depend_on_ids')">
    <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'depend_on_ids'">
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; border: 2px solid #017e84; background: white; z-index: 90;" tabindex="0" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
            <span class="text-truncate px-1 fw-bold text-dark" style="font-size: 11px;"><t t-esc="state.editingCell.val.length ? state.editingCell.val.length + ' tasks' : 'Select...'"/></span>
            <i class="fa fa-caret-down me-1 text-dark"/>
        </div>
        <div class="o_ug_dep_dropdown" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-height: 220px; overflow-y: auto; z-index: 1050; border-radius: 4px; padding: 4px;">
            <div class="p-1 mb-1 border-bottom fw-bolder text-muted" style="font-size: 10px; text-transform: uppercase;">Predecessors</div>
            <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                <label t-if="tt.id !== t.id" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                    <input type="checkbox" class="form-check-input m-0" t-att-checked="state.editingCell.val.includes(tt.id)" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                    <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                </label>
            </t>
            <div class="p-2 mt-1 border-top text-end">
                <button class="btn btn-sm btn-primary" style="font-size: 11px; padding: 2px 10px;" t-on-click.stop="this.commitCellEdit">Apply</button>
            </div>
        </div>
    </t>
    <t t-else="">
        <t t-esc="t.predecessor_wbs || '-'"/>
    </t>
</div>'''

# 3. Replace successors block
old_succ_full = '''<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'dependent_ids')">
    <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'dependent_ids'">
        <select multiple="1" class="o_ug_cell_editor" style="height: auto; min-height: 80px; position: absolute; z-index: 100; top: 100%; left: 0; width: 100%;" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
            <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                <option t-if="tt.id !== t.id" t-att-value="tt.id"><t t-esc="tt.name"/></option>
            </t>
        </select>
    </t>
    <t t-else="">
        <t t-esc="t.successor_wbs || '-'"/>
    </t>
</div>'''

new_succ_full = '''<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px; position: relative; overflow: visible;" t-on-dblclick="() => this.startCellEdit(t, 'dependent_ids')">
    <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'dependent_ids'">
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; border: 2px solid #017e84; background: white; z-index: 90;" tabindex="0" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
            <span class="text-truncate px-1 fw-bold text-dark" style="font-size: 11px;"><t t-esc="state.editingCell.val.length ? state.editingCell.val.length + ' tasks' : 'Select...'"/></span>
            <i class="fa fa-caret-down me-1 text-dark"/>
        </div>
        <div class="o_ug_dep_dropdown" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-height: 220px; overflow-y: auto; z-index: 1050; border-radius: 4px; padding: 4px;">
            <div class="p-1 mb-1 border-bottom fw-bolder text-muted" style="font-size: 10px; text-transform: uppercase;">Successors</div>
            <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                <label t-if="tt.id !== t.id" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                    <input type="checkbox" class="form-check-input m-0" t-att-checked="state.editingCell.val.includes(tt.id)" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                    <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                </label>
            </t>
            <div class="p-2 mt-1 border-top text-end">
                <button class="btn btn-sm btn-primary" style="font-size: 11px; padding: 2px 10px;" t-on-click.stop="this.commitCellEdit">Apply</button>
            </div>
        </div>
    </t>
    <t t-else="">
        <t t-esc="t.successor_wbs || '-'"/>
    </t>
</div>'''

content = content.replace(old_pred_full, new_pred_full)
content = content.replace(old_succ_full, new_succ_full)

# Make sure CSS hover class exists
css_injection = """
            .hover-bg-light:hover { background-color: #f1f5f9 !important; }
"""
if ".hover-bg-light:hover" not in content:
    content = content.replace("</style>", css_injection + "</style>")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching dependency UI successful!")
