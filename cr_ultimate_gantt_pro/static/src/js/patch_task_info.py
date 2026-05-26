import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old_general = '''                                <t t-if="state.editorTab === 'general'">
                                    <div class="o_ug_input_group">
                                        <label class="o_ug_input_label">Name</label>
                                        <input type="text" class="o_ug_input" t-model="state.editorTask.name"/>
                                    </div>
                                    <div class="row g-3">
                                        <div class="col-6">
                                            <label class="o_ug_input_label">% Complete</label>
                                            <input type="number" class="o_ug_input" t-model.number="state.editorTask.actual_progress" min="0" max="100"/>
                                        </div>
                                        <div class="col-6">
                                            <label class="o_ug_input_label">Effort (Hours)</label>
                                            <input type="number" class="o_ug_input" t-model.number="state.editorTask.effort" placeholder="e.g. 48"/>
                                        </div>
                                    </div>
                                    <div class="row g-3 mt-1">
                                        <div class="col-6">
                                            <label class="o_ug_input_label">Start Date</label>
                                            <input type="datetime-local" class="o_ug_input" t-model="state.editorTask.planned_date_begin"/>
                                        </div>
                                        <div class="col-6">
                                            <label class="o_ug_input_label">Finish Date</label>
                                            <input type="datetime-local" class="o_ug_input" t-model="state.editorTask.date_deadline"/>
                                        </div>
                                    </div>
                                    <div class="o_ug_input_group mt-3">
                                        <label class="o_ug_input_label">Gantt Color</label>
                                        <div class="d-flex gap-2">
                                            <t t-foreach="['#4285F4','#34A853','#FBBC05','#EA4335','#71639e','#1e293b']" t-as="c" t-key="c">
                                                <div t-attf-style="width:28px; height:28px; background:{{c}}; border-radius:50%; cursor:pointer; border:3px solid {{state.editorTask.gantt_color === c ? '#000' : 'white'}}; box-shadow:0 2px 4px rgba(0,0,0,0.1);"
                                                     t-on-click="() => state.editorTask.gantt_color = c"/>
                                            </t>
                                        </div>
                                    </div>
                                </t>'''

new_general = '''                                <t t-if="state.editorTab === 'general'">
                                    <div class="row align-items-center mb-3">
                                        <div class="col-3 text-start text-muted" style="font-size: 13px;">Name</div>
                                        <div class="col-9">
                                            <input type="text" class="form-control form-control-sm border-secondary shadow-none" t-model="state.editorTask.name" style="border-radius: 6px;"/>
                                        </div>
                                    </div>
                                    <div class="row align-items-center mb-4">
                                        <div class="col-3 text-start text-muted" style="font-size: 13px;">% complete</div>
                                        <div class="col-3">
                                            <input type="number" class="form-control form-control-sm border-secondary shadow-none" t-model.number="state.editorTask.actual_progress" min="0" max="100" style="border-radius: 6px;"/>
                                        </div>
                                        <div class="col-2 text-center text-muted" style="font-size: 13px;">Effort</div>
                                        <div class="col-4">
                                            <div class="input-group input-group-sm">
                                                <input type="number" class="form-control border-secondary shadow-none" t-model.number="state.editorTask.effort" style="border-radius: 6px 0 0 6px; border-right: none;"/>
                                                <span class="input-group-text bg-white border-secondary text-dark" style="border-radius: 0 6px 6px 0; border-left: none; padding-left: 0; font-size: 13px;">hours</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="position-relative text-center my-4">
                                        <hr class="text-secondary opacity-25" style="border-top: 1px solid; margin: 0;"/>
                                        <span class="bg-white px-3 text-muted position-absolute" style="top: -10px; left: 50%; transform: translateX(-50%); font-size: 12px;">Dates</span>
                                    </div>

                                    <div class="row align-items-center mb-3">
                                        <div class="col-3 text-start text-muted" style="font-size: 13px;">Start</div>
                                        <div class="col-9">
                                            <input type="datetime-local" class="form-control form-control-sm border-secondary shadow-none text-dark" t-model="state.editorTask.planned_date_begin" style="border-radius: 6px;"/>
                                        </div>
                                    </div>
                                    <div class="row align-items-center mb-3">
                                        <div class="col-3 text-start text-muted" style="font-size: 13px;">Finish</div>
                                        <div class="col-9">
                                            <input type="datetime-local" class="form-control form-control-sm border-secondary shadow-none text-dark" t-model="state.editorTask.date_deadline" style="border-radius: 6px;"/>
                                        </div>
                                    </div>

                                    <div class="row align-items-center mb-3">
                                        <div class="col-3 text-start text-muted" style="font-size: 13px;">Duration</div>
                                        <div class="col-3">
                                            <div class="input-group input-group-sm">
                                                <input type="number" class="form-control border-secondary shadow-none" t-model.number="state.editorTask.duration" style="border-radius: 6px 0 0 6px; border-right: none;"/>
                                                <span class="input-group-text bg-white border-secondary text-dark" style="border-radius: 0 6px 6px 0; border-left: none; padding-left: 0; font-size: 13px;">days</span>
                                            </div>
                                        </div>
                                        <div class="col-2 text-center text-muted" style="font-size: 13px;">Color</div>
                                        <div class="col-4 position-relative">
                                            <div class="form-control form-control-sm border-secondary d-flex align-items-center justify-content-between shadow-none" style="border-radius: 6px; cursor: pointer; background: white;" tabindex="0" t-on-click="() => state.colorDropdownOpen = !state.colorDropdownOpen" t-on-blur="() => setTimeout(() => state.colorDropdownOpen = false, 200)">
                                                <div class="d-flex align-items-center">
                                                    <div t-if="state.editorTask.gantt_color" t-attf-style="width:14px; height:14px; border-radius:50%; background:{{state.editorTask.gantt_color}}; margin-right: 8px;"></div>
                                                    <div t-else="" style="width:14px; height:14px; border-radius:50%; border: 1px solid #ccc; margin-right: 8px; background: white;"></div>
                                                    <span class="text-dark" style="font-size: 13px;"><t t-esc="state.editorTask.gantt_color ? state.editorTask.gantt_color : 'No color'"/></span>
                                                </div>
                                                <i class="fa fa-caret-down text-muted"/>
                                            </div>
                                            <div t-if="state.colorDropdownOpen" class="position-absolute w-100 bg-white border border-secondary shadow-sm" style="top: 100%; left: 0; z-index: 1060; border-radius: 6px; max-height: 150px; overflow-y: auto;">
                                                <div class="p-2 hover-bg-light d-flex align-items-center" style="cursor: pointer;" t-on-click="() => { state.editorTask.gantt_color = false; state.colorDropdownOpen = false; }">
                                                    <div style="width:14px; height:14px; border-radius:50%; border: 1px solid #ccc; margin-right: 8px; background: white;"></div>
                                                    <span style="font-size: 13px;">No color</span>
                                                </div>
                                                <t t-foreach="['#4285F4','#34A853','#FBBC05','#EA4335','#71639e','#1e293b']" t-as="c" t-key="c">
                                                    <div class="p-2 hover-bg-light d-flex align-items-center" style="cursor: pointer;" t-on-click="() => { state.editorTask.gantt_color = c; state.colorDropdownOpen = false; }">
                                                        <div t-attf-style="width:14px; height:14px; border-radius:50%; background:{{c}}; margin-right: 8px;"></div>
                                                        <span style="font-size: 13px;"><t t-esc="c"/></span>
                                                    </div>
                                                </t>
                                            </div>
                                        </div>
                                    </div>
                                </t>'''

old_footer = '''                            <div class="o_ug_modal_footer mt-4 border-top pt-3 d-flex justify-content-end align-items-center">
                                <button class="btn btn-outline-danger me-auto fw-bold px-4" t-on-click="() => this.deleteTask(state.editorTask.id)">Delete</button>
                                <button class="btn btn-light px-4 fw-bold border" t-on-click="this.closeEditor">Cancel</button>
                                <button class="btn btn-primary px-4 fw-bold shadow-sm" t-on-click="this.saveEditor">Save Changes</button>
                            </div>'''

new_footer = '''                            <div class="o_ug_modal_footer mt-4 pt-3 d-flex justify-content-end align-items-center" style="border-top: 1px solid rgba(0,0,0,0.05);">
                                <span class="me-auto fw-bold" style="cursor: pointer; color: #333;" t-on-click="() => this.deleteTask(state.editorTask.id)">Delete</span>
                                <span class="fw-bold mx-4" style="cursor: pointer; color: #333;" t-on-click="this.closeEditor">Cancel</span>
                                <button class="btn text-white fw-bold px-4 shadow-sm" style="background-color: #5d4037; border-radius: 6px;" t-on-click="this.saveEditor">Save</button>
                            </div>'''

content = content.replace(old_general, new_general)
content = content.replace(old_footer, new_footer)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Redesigned Task Information modal applied!")
