import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the read-only predecessors
old_pred = '''<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px;"><t t-esc="t.predecessor_wbs"/></div>'''
new_pred = '''<div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'depend_on_ids')">
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

# 2. Replace the read-only successors
old_succ = '''<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px;"><t t-esc="t.successor_wbs"/></div>'''
new_succ = '''<div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'dependent_ids')">
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

content = content.replace(old_pred, new_pred)
content = content.replace(old_succ, new_succ)

# 3. Add to commitCellEdit
commit_hook = '''        let finalVal = val;
        let writeVals = {};
        if (field === 'depend_on_ids' || field === 'dependent_ids') {
            writeVals[field] = [[6, 0, Array.isArray(val) ? val.map(Number) : []]];
        } else if (field.includes('date')) {'''

content = content.replace(
    '''        let finalVal = val;
        let writeVals = {};
        if (field.includes('date')) {''',
    commit_hook
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching successors/predecessors successful!")
