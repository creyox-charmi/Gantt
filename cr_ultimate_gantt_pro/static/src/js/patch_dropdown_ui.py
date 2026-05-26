import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the predecessor block
old_pred_dropdown = '''        <div class="o_ug_dep_dropdown" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-height: 220px; overflow-y: auto; z-index: 1050; border-radius: 4px; padding: 4px;">
            <div class="p-1 mb-1 border-bottom fw-bolder text-muted" style="font-size: 10px; text-transform: uppercase;">Predecessors</div>
            <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                <label t-if="tt.id !== t.id" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                    <input type="checkbox" class="form-check-input m-0" t-att-checked="(state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id))" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                    <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                </label>
            </t>
            <div class="p-2 mt-1 border-top text-end">
                <button class="btn btn-sm btn-primary" style="font-size: 11px; padding: 2px 10px;" t-on-click.stop="this.commitCellEdit">Apply</button>
            </div>
        </div>'''

new_pred_dropdown = '''        <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="this.commitCellEdit"></div>
        <div class="o_ug_dep_dropdown d-flex flex-column" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1050; border-radius: 4px;">
            <div class="p-2 border-bottom fw-bolder text-muted bg-light" style="font-size: 10px; text-transform: uppercase; border-radius: 4px 4px 0 0;">Predecessors</div>
            <div style="max-height: 200px; overflow-y: auto; padding: 4px;">
                <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                    <label t-if="tt.id !== t.id &amp;&amp; (!t.dependent_ids || !t.dependent_ids.includes(tt.id))" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                        <input type="checkbox" class="form-check-input m-0 flex-shrink-0" t-att-checked="(state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id))" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                        <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                    </label>
                </t>
            </div>
            <div class="p-2 border-top text-end bg-light" style="border-radius: 0 0 4px 4px;">
                <button class="btn btn-sm btn-primary w-100" style="font-size: 12px; padding: 4px 10px;" t-on-click.stop.prevent="this.commitCellEdit">Apply Changes</button>
            </div>
        </div>'''

content = content.replace(old_pred_dropdown, new_pred_dropdown)

# Replace the successor block
old_succ_dropdown = '''        <div class="o_ug_dep_dropdown" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-height: 220px; overflow-y: auto; z-index: 1050; border-radius: 4px; padding: 4px;">
            <div class="p-1 mb-1 border-bottom fw-bolder text-muted" style="font-size: 10px; text-transform: uppercase;">Successors</div>
            <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                <label t-if="tt.id !== t.id" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                    <input type="checkbox" class="form-check-input m-0" t-att-checked="(state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id))" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                    <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                </label>
            </t>
            <div class="p-2 mt-1 border-top text-end">
                <button class="btn btn-sm btn-primary" style="font-size: 11px; padding: 2px 10px;" t-on-click.stop="this.commitCellEdit">Apply</button>
            </div>
        </div>'''

new_succ_dropdown = '''        <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="this.commitCellEdit"></div>
        <div class="o_ug_dep_dropdown d-flex flex-column" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1050; border-radius: 4px;">
            <div class="p-2 border-bottom fw-bolder text-muted bg-light" style="font-size: 10px; text-transform: uppercase; border-radius: 4px 4px 0 0;">Successors</div>
            <div style="max-height: 200px; overflow-y: auto; padding: 4px;">
                <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                    <label t-if="tt.id !== t.id &amp;&amp; (!t.depend_on_ids || !t.depend_on_ids.includes(tt.id))" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                        <input type="checkbox" class="form-check-input m-0 flex-shrink-0" t-att-checked="(state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id))" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                        <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                    </label>
                </t>
            </div>
            <div class="p-2 border-top text-end bg-light" style="border-radius: 0 0 4px 4px;">
                <button class="btn btn-sm btn-primary w-100" style="font-size: 12px; padding: 4px 10px;" t-on-click.stop.prevent="this.commitCellEdit">Apply Changes</button>
            </div>
        </div>'''

content = content.replace(old_succ_dropdown, new_succ_dropdown)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching dropdown UI structural issues successful!")
