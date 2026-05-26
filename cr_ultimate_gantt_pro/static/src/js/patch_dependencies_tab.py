import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old_preds = '''                                <t t-if="state.editorTab === 'predecessors'">
                                    <div class="d-flex flex-column h-100">
                                        <div class="flex-grow-1 overflow-auto" style="max-height: 300px;">
                                            <table class="o_ug_table">
                                                <thead><tr><th>Name</th><th>Type</th><th>Lag</th><th style="width:50px;"></th></tr></thead>
                                                <tbody>
                                                    <t t-foreach="state.editorTask._preds" t-as="pId" t-key="pId">
                                                        <t t-set="pT" t-value="this.props.model.allTasksList.find(x=>x.id===pId)"/>
                                                        <tr>
                                                            <td>
                                                                <select class="form-select form-select-sm border-0 bg-transparent" t-on-change="(ev) => this.updatePredecessor(pId, ev.target.value)">
                                                                    <t t-foreach="this.props.model.allTasksList" t-as="ot" t-key="ot.id">
                                                                        <option t-att-value="ot.id" t-att-selected="ot.id === pId"><t t-esc="ot.name"/></option>
                                                                    </t>
                                                                </select>
                                                            </td>
                                                            <td><span class="badge bg-light text-muted">FS</span></td>
                                                            <td>0d</td>
                                                            <td class="text-center"><i class="fa fa-trash-o text-danger cursor-pointer" t-on-click="() => this.delPred(pId)"/></td>
                                                        </tr>
                                                    </t>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div class="mt-2">
                                            <button class="btn btn-sm btn-outline-primary" t-on-click="this.addPred"><i class="fa fa-plus"/> Add Predecessor</button>
                                        </div>
                                    </div>
                                </t>'''

new_preds = '''                                <t t-if="state.editorTab === 'predecessors'">
                                    <div class="d-flex flex-column h-100">
                                        <div class="flex-grow-1 overflow-auto border rounded mb-2" style="max-height: 250px;">
                                            <table class="table table-sm table-hover mb-0" style="font-size: 13px;">
                                                <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                                                    <tr>
                                                        <th class="fw-bold text-muted border-bottom-0" style="padding: 10px;">Name</th>
                                                        <th class="fw-bold text-muted border-bottom-0" style="padding: 10px; width: 140px;">Type</th>
                                                        <th class="fw-bold text-muted border-bottom-0" style="padding: 10px; width: 100px;">Lag</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <t t-foreach="state.editorTask._preds" t-as="pId" t-key="pId">
                                                        <t t-set="pT" t-value="this.props.model.allTasksList.find(x=>x.id===pId)"/>
                                                        <tr style="cursor: pointer;" t-attf-class="{{state.selectedPred === pId ? 'table-primary' : ''}}" t-on-click="() => state.selectedPred = pId">
                                                            <td class="p-0 border-end" style="vertical-align: middle;">
                                                                <select class="form-select form-select-sm border-0 shadow-none text-dark bg-transparent w-100 h-100" t-on-change="(ev) => this.updatePredecessor(pId, ev.target.value)" style="border-radius: 0; min-height: 36px; cursor: pointer;">
                                                                    <t t-foreach="this.props.model.allTasksList" t-as="ot" t-key="ot.id">
                                                                        <option t-att-value="ot.id" t-att-selected="ot.id === pId"><t t-esc="ot.name"/></option>
                                                                    </t>
                                                                </select>
                                                            </td>
                                                            <td class="p-0 border-end" style="vertical-align: middle;">
                                                                <select class="form-select form-select-sm border-0 shadow-none text-dark bg-transparent w-100 h-100" style="border-radius: 0; min-height: 36px; cursor: pointer;">
                                                                    <option value="FS" selected="1">Finish-To-Start</option>
                                                                    <option value="SS">Start-To-Start</option>
                                                                    <option value="FF">Finish-To-Finish</option>
                                                                    <option value="SF">Start-To-Finish</option>
                                                                </select>
                                                            </td>
                                                            <td class="p-0" style="vertical-align: middle;">
                                                                <input type="text" class="form-control form-control-sm border-0 shadow-none text-dark bg-transparent w-100 h-100" value="0 days" style="border-radius: 0; min-height: 36px;"/>
                                                            </td>
                                                        </tr>
                                                    </t>
                                                    <tr t-if="!state.editorTask._preds || state.editorTask._preds.length === 0">
                                                        <td colspan="3" class="text-center text-muted py-4">No predecessors defined</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div class="d-flex align-items-center gap-2 mt-1">
                                            <button class="btn btn-sm btn-light border fw-bold text-dark px-3 shadow-sm" style="border-radius: 4px;" t-on-click="this.addPred"><i class="fa fa-plus text-primary me-1"/> Add</button>
                                            <button class="btn btn-sm btn-light border fw-bold px-3 shadow-sm" style="border-radius: 4px;" t-attf-class="{{!state.selectedPred ? 'text-muted' : 'text-danger'}}" t-on-click="() => { if(state.selectedPred) { this.delPred(state.selectedPred); state.selectedPred = null; } }"><i class="fa fa-minus me-1"/> Remove</button>
                                        </div>
                                    </div>
                                </t>'''

old_succs = '''                                <t t-if="state.editorTab === 'successors'">
                                    <table class="o_ug_table">
                                        <thead><tr><th>Name</th><th>Type</th><th>Lag</th></tr></thead>
                                        <tbody>
                                            <t t-foreach="this.getTaskSuccessors(state.editorTask.id)" t-as="s" t-key="s.id">
                                                <tr>
                                                    <td><t t-esc="s.name"/></td>
                                                    <td><span class="badge bg-light text-muted">FS</span></td>
                                                    <td>0d</td>
                                                </tr>
                                            </t>
                                        </tbody>
                                    </table>
                                </t>'''

new_succs = '''                                <t t-if="state.editorTab === 'successors'">
                                    <div class="d-flex flex-column h-100">
                                        <div class="flex-grow-1 overflow-auto border rounded mb-2" style="max-height: 250px;">
                                            <table class="table table-sm table-hover mb-0" style="font-size: 13px;">
                                                <thead class="table-light" style="position: sticky; top: 0; z-index: 1;">
                                                    <tr>
                                                        <th class="fw-bold text-muted border-bottom-0" style="padding: 10px;">Name</th>
                                                        <th class="fw-bold text-muted border-bottom-0" style="padding: 10px; width: 140px;">Type</th>
                                                        <th class="fw-bold text-muted border-bottom-0" style="padding: 10px; width: 100px;">Lag</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <t t-set="succs" t-value="this.getTaskSuccessors(state.editorTask.id)"/>
                                                    <t t-foreach="succs" t-as="s" t-key="s.id">
                                                        <tr style="cursor: pointer;" t-attf-class="{{state.selectedSucc === s.id ? 'table-primary' : ''}}" t-on-click="() => state.selectedSucc = s.id">
                                                            <td class="p-0 border-end" style="vertical-align: middle;">
                                                                <select disabled="1" class="form-select form-select-sm border-0 shadow-none text-dark bg-transparent w-100 h-100" style="border-radius: 0; min-height: 36px; cursor: pointer; opacity: 1;">
                                                                    <option selected="1"><t t-esc="s.name"/></option>
                                                                </select>
                                                            </td>
                                                            <td class="p-0 border-end" style="vertical-align: middle;">
                                                                <select class="form-select form-select-sm border-0 shadow-none text-dark bg-transparent w-100 h-100" style="border-radius: 0; min-height: 36px; cursor: pointer;">
                                                                    <option value="FS" selected="1">Finish-To-Start</option>
                                                                    <option value="SS">Start-To-Start</option>
                                                                    <option value="FF">Finish-To-Finish</option>
                                                                    <option value="SF">Start-To-Finish</option>
                                                                </select>
                                                            </td>
                                                            <td class="p-0" style="vertical-align: middle;">
                                                                <input type="text" class="form-control form-control-sm border-0 shadow-none text-dark bg-transparent w-100 h-100" value="0 days" style="border-radius: 0; min-height: 36px;"/>
                                                            </td>
                                                        </tr>
                                                    </t>
                                                    <tr t-if="!succs || succs.length === 0">
                                                        <td colspan="3" class="text-center text-muted py-4">No successors defined</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div class="d-flex align-items-center gap-2 mt-1">
                                            <span class="text-muted fst-italic" style="font-size: 12px;"><i class="fa fa-info-circle me-1"/> To manage successors, please edit the target task's Predecessor tab.</span>
                                        </div>
                                    </div>
                                </t>'''

content = content.replace(old_preds, new_preds)
content = content.replace(old_succs, new_succs)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Redesigned Predecessors and Successors tabs!")
