import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update task searchRead fields to include "inactive_dependency_ids"
old_search_read = 'if (pIds.length > 0) tasks = await this.orm.searchRead("project.task", [["project_id", "in", pIds]], ["name", "project_id", "planned_date_begin", "date_deadline", "actual_progress", "gantt_color", "depend_on_ids", "parent_id", "user_ids", "sequence", "stage_id", "baseline_start_date", "baseline_end_date", "baseline_duration", "effort", "scheduling_mode", "constraint_type", "constraint_date", "manually_scheduled", "rollup", "inactive", "calendar_id", "ignore_resource_calendar", "effort_driven", "project_border", "description", "cost", "complexity", "is_milestone"], { order: "sequence ASC" });'

new_search_read = 'if (pIds.length > 0) tasks = await this.orm.searchRead("project.task", [["project_id", "in", pIds]], ["name", "project_id", "planned_date_begin", "date_deadline", "actual_progress", "gantt_color", "depend_on_ids", "inactive_dependency_ids", "parent_id", "user_ids", "sequence", "stage_id", "baseline_start_date", "baseline_end_date", "baseline_duration", "effort", "scheduling_mode", "constraint_type", "constraint_date", "manually_scheduled", "rollup", "inactive", "calendar_id", "ignore_resource_calendar", "effort_driven", "project_border", "description", "cost", "complexity", "is_milestone"], { order: "sequence ASC" });'

content = content.replace(old_search_read, new_search_read)

# 2. Add inactive arrow marker to SVG <defs>
old_defs = '''                            <defs>
                                <marker id="ugp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8"/></marker>
                                <marker id="ugp-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d9534f"/></marker>
                            </defs>'''

new_defs = '''                            <defs>
                                <marker id="ugp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8"/></marker>
                                <marker id="ugp-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d9534f"/></marker>
                                <marker id="ugp-arrow-inactive" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#cbd5e1"/></marker>
                            </defs>'''

content = content.replace(old_defs, new_defs)

# 3. Update the SVG path loop rendering inactive lines as dashed
old_path_loop = '<t t-foreach="this.depLines" t-as="dl" t-key="dl.id"><path t-att-d="dl.path" fill="none" t-att-stroke="dl.isCritical ? \'#d9534f\' : \'#94a3b8\'" stroke-width="1.2" t-att-marker-end="dl.isCritical ? \'url(#ugp-arrow-crit)\' : \'url(#ugp-arrow)\'"/></t>'

new_path_loop = '<t t-foreach="this.depLines" t-as="dl" t-key="dl.id"><path t-att-d="dl.path" fill="none" t-att-stroke="dl.isInactive ? \'#cbd5e1\' : (dl.isCritical ? \'#d9534f\' : \'#94a3b8\')" t-att-stroke-dasharray="dl.isInactive ? \'4\' : \'0\'" stroke-width="1.2" t-att-marker-end="dl.isInactive ? \'url(#ugp-arrow-inactive)\' : (dl.isCritical ? \'url(#ugp-arrow-crit)\' : \'url(#ugp-arrow)\'"/></t>'

content = content.replace(old_path_loop, new_path_loop)

# 4. Update the Predecessors list grid checkbox to bind to _inactive_preds
old_preds_checkbox = '''                                                            <td class="p-0 text-center" style="vertical-align: middle;">
                                                                <input type="checkbox" checked="1" class="form-check-input mt-0" style="cursor: pointer;"/>
                                                                <div class="d-none"><t t-esc="pId"/></div>
                                                            </td>'''

new_preds_checkbox = '''                                                            <td class="p-0 text-center" style="vertical-align: middle;">
                                                                <input type="checkbox" class="form-check-input mt-0" style="cursor: pointer;"
                                                                       t-att-checked="!state.editorTask._inactive_preds.includes(pId)"
                                                                       t-on-change="(ev) => this.toggleActivePred(pId, ev.target.checked)"/>
                                                            </td>'''

content = content.replace(old_preds_checkbox, new_preds_checkbox)

# 5. Update the Successors list grid checkbox to bind to _inactive_succs
old_succs_checkbox = '''                                                            <td class="p-0 text-center" style="vertical-align: middle;">
                                                                <input type="checkbox" checked="1" class="form-check-input mt-0" style="cursor: pointer;"/>
                                                                <div class="d-none"><t t-esc="s.id"/></div>
                                                            </td>'''

new_succs_checkbox = '''                                                            <td class="p-0 text-center" style="vertical-align: middle;">
                                                                <input type="checkbox" class="form-check-input mt-0" style="cursor: pointer;"
                                                                       t-att-checked="!state.editorTask._inactive_succs.includes(s.id)"
                                                                       t-on-change="(ev) => this.toggleActiveSucc(s.id, ev.target.checked)"/>
                                                            </td>'''

content = content.replace(old_succs_checkbox, new_succs_checkbox)

# 6. Update openTaskEditor to load active/inactive lists
old_open_editor = '''    openTaskEditor(t) {
        this.state.editorTab = 'general';
        this.state.editorTask = {
            ...t,
            planned_date_begin: t.planned_date_begin.replace(' ', 'T').substring(0, 16),
            date_deadline: t.date_deadline.replace(' ', 'T').substring(0, 16),
            constraint_date: t.constraint_date ? t.constraint_date.replace(' ', 'T').substring(0, 16) : null,
            _preds: [...(t.depend_on_ids || [])],
            _resources: [...(t.user_ids || [])]
        };
    }'''

new_open_editor = '''    openTaskEditor(t) {
        this.state.editorTab = 'general';
        const successors = this.getTaskSuccessors(t.id) || [];
        this.state.editorTask = {
            ...t,
            planned_date_begin: t.planned_date_begin.replace(' ', 'T').substring(0, 16),
            date_deadline: t.date_deadline.replace(' ', 'T').substring(0, 16),
            constraint_date: t.constraint_date ? t.constraint_date.replace(' ', 'T').substring(0, 16) : null,
            _preds: [...(t.depend_on_ids || [])],
            _inactive_preds: [...(t.inactive_dependency_ids || [])],
            _resources: [...(t.user_ids || [])],
            _inactive_succs: successors.filter(s => (s.inactive_dependency_ids || []).includes(t.id)).map(s => s.id)
        };
    }
    toggleActivePred(pId, checked) {
        if (!checked) {
            if (!this.state.editorTask._inactive_preds.includes(pId)) {
                this.state.editorTask._inactive_preds.push(pId);
            }
        } else {
            this.state.editorTask._inactive_preds = this.state.editorTask._inactive_preds.filter(id => id !== pId);
        }
    }
    toggleActiveSucc(succId, checked) {
        if (!checked) {
            if (!this.state.editorTask._inactive_succs.includes(succId)) {
                this.state.editorTask._inactive_succs.push(succId);
            }
        } else {
            this.state.editorTask._inactive_succs = this.state.editorTask._inactive_succs.filter(id => id !== succId);
        }
    }'''

content = content.replace(old_open_editor, new_open_editor)

# 7. Update saveEditor to write inactive lists
old_save_editor = '''    async saveEditor() {
        const et = this.state.editorTask;
        const original = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === et.id);
        const sStr = et.planned_date_begin.replace('T', ' ') + ':00';
        const eStr = et.date_deadline.replace('T', ' ') + ':00';

        const vals = {
            name: et.name,
            planned_date_begin: sStr,
            date_deadline: eStr,
            actual_progress: et.actual_progress,
            effort: et.effort,
            scheduling_mode: et.scheduling_mode,
            scheduling_direction: et.scheduling_direction,
            constraint_type: et.constraint_type,
            constraint_date: et.constraint_date ? et.constraint_date.replace('T', ' ') + ':00' : false,
            manually_scheduled: et.manually_scheduled,
            ignore_resource_calendar: et.ignore_resource_calendar,
            effort_driven: et.effort_driven,
            project_border: et.project_border,
            depend_on_ids: [[6, 0, et._preds]],
            user_ids: [[6, 0, et._resources]]
        };
        this.pushHistory('update', { id: et.id, ...original }, { id: et.id, ...vals });
        await this.orm.write("project.task", [et.id], vals);
        await this.props.model.load(this.props.model.params);'''

new_save_editor = '''    async saveEditor() {
        const et = this.state.editorTask;
        const original = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === et.id);
        const sStr = et.planned_date_begin.replace('T', ' ') + ':00';
        const eStr = et.date_deadline.replace('T', ' ') + ':00';

        const vals = {
            name: et.name,
            planned_date_begin: sStr,
            date_deadline: eStr,
            actual_progress: et.actual_progress,
            effort: et.effort,
            scheduling_mode: et.scheduling_mode,
            scheduling_direction: et.scheduling_direction,
            constraint_type: et.constraint_type,
            constraint_date: et.constraint_date ? et.constraint_date.replace('T', ' ') + ':00' : false,
            manually_scheduled: et.manually_scheduled,
            ignore_resource_calendar: et.ignore_resource_calendar,
            effort_driven: et.effort_driven,
            project_border: et.project_border,
            depend_on_ids: [[6, 0, et._preds]],
            inactive_dependency_ids: [[6, 0, et._inactive_preds]],
            user_ids: [[6, 0, et._resources]]
        };
        this.pushHistory('update', { id: et.id, ...original }, { id: et.id, ...vals });
        await this.orm.write("project.task", [et.id], vals);

        // Also write active/inactive changes to successor tasks
        const originalSuccs = (this.getTaskSuccessors(et.id) || []).map(s => s.id);
        for (const succId of originalSuccs) {
            const isInactiveNow = et._inactive_succs.includes(succId);
            const succTask = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === succId);
            if (succTask) {
                let currentInactiveDeps = [...(succTask.inactive_dependency_ids || [])];
                const alreadyInactive = currentInactiveDeps.includes(et.id);
                if (isInactiveNow && !alreadyInactive) {
                    currentInactiveDeps.push(et.id);
                    await this.orm.write("project.task", [succId], { inactive_dependency_ids: [[6, 0, currentInactiveDeps]] });
                } else if (!isInactiveNow && alreadyInactive) {
                    currentInactiveDeps = currentInactiveDeps.filter(id => id !== et.id);
                    await this.orm.write("project.task", [succId], { inactive_dependency_ids: [[6, 0, currentInactiveDeps]] });
                }
            }
        }

        await this.props.model.load(this.props.model.params);'''

content = content.replace(old_save_editor, new_save_editor)

# 8. Exclude inactive predecessors from task dragging scheduling calculation (onDragMove / onBMD)
old_preds_drag = 'let preds = tasks.filter(x => (t.depend_on_ids || []).includes(x.id));'
new_preds_drag = 'let preds = tasks.filter(x => (t.depend_on_ids || []).includes(x.id) && !(t.inactive_dependency_ids || []).includes(x.id));'
content = content.replace(old_preds_drag, new_preds_drag)

# 9. Exclude inactive predecessors from successor chain
old_chain = 'tasks.filter(t => (t.depend_on_ids || []).some(id => String(id) === curId)).forEach(s => {'
new_chain = 'tasks.filter(t => (t.depend_on_ids || []).some(id => String(id) === curId && !(t.inactive_dependency_ids || []).includes(Number(id)))).forEach(s => {'
content = content.replace(old_chain, new_chain)

# 10. Exclude inactive predecessors from computeSchedule validation and propagation
old_compute_schedule = '''                if (!t.depend_on_ids || !t.depend_on_ids.length) return;

                let maxEnd = null;
                t.depend_on_ids.forEach(pId => {
                    const pred = taskMap[pId];
                    if (pred) {
                        if (!maxEnd || pred.e > maxEnd) maxEnd = pred.e;
                    }
                });'''

new_compute_schedule = '''                const activePreds = (t.depend_on_ids || []).filter(pId => !(t.inactive_dependency_ids || []).includes(pId));
                if (!activePreds.length) return;

                let maxEnd = null;
                activePreds.forEach(pId => {
                    const pred = taskMap[pId];
                    if (pred) {
                        if (!maxEnd || pred.e > maxEnd) maxEnd = pred.e;
                    }
                });'''

content = content.replace(old_compute_schedule, new_compute_schedule)

# 11. Append isInactive to each line inside depLines getter
old_l_push = 'l.push({ id: `d_${pI}_${t.id}`, path: path, isCritical: t.isCritical && pr.isCritical && this.state.config.gantt_show_critical_path });'
new_l_push = 'l.push({ id: `d_${pI}_${t.id}`, path: path, isCritical: t.isCritical && pr.isCritical && this.state.config.gantt_show_critical_path, isInactive: (t.inactive_dependency_ids || []).includes(pI) });'
content = content.replace(old_l_push, new_l_push)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Active/Inactive dependency visuals and scheduling behaviors successfully patched!")
