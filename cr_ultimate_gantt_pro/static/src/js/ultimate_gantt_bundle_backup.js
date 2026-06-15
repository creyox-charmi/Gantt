/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Model, useModel } from "@web/model/model";
import { Component, xml, onMounted, useRef, onWillStart, useState, useEffect, onWillUnmount } from "@odoo/owl";
import { Layout } from "@web/search/layout";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { SearchBar } from "@web/search/search_bar/search_bar";
import { CogMenu } from "@web/search/cog_menu/cog_menu";
import { useService } from "@web/core/utils/hooks";
import { deserializeDateTime, serializeDateTime } from "@web/core/l10n/dates";

const { DateTime } = luxon;

const SCALES = [
    { id: 'year', label: 'Years', px: 0.5, unit: 'year', shift: { years: 1 }, desc: 'Yearly' },
    { id: 'quarter', label: 'Quarters', px: 2, unit: 'quarter', shift: { months: 3 }, desc: 'Quarterly' },
    { id: 'month', label: 'Months', px: 8, unit: 'month', shift: { months: 1 }, desc: 'Monthly' },
    { id: 'week', label: 'Weeks', px: 25, unit: 'week', shift: { weeks: 1 }, desc: 'Weekly' },
    { id: 'day', label: 'Days', px: 65, unit: 'day', shift: { days: 7 }, desc: 'Daily' },
    { id: 'hour', label: 'Hours', px: 1200, unit: 'hour', shift: { days: 1 }, desc: 'Hourly' },
    { id: '15m', label: '15 Min', px: 5000, unit: '15m', shift: { hours: 6 }, desc: '15 Min' },
    { id: '5m', label: '5 Min', px: 15000, unit: '5m', shift: { hours: 2 }, desc: '5 Min' }
];

export class UltimateGanttModel extends Model {
    static services = ["orm", "action"];
    setup(params, services) {
        this.orm = services.orm;
        this.action = services.action;
        this.params = params;
        this.sId = null;
    }
    async load(params) {
        this.params = params;
        const res = await this.orm.searchRead(params.resModel, params.domain || [], ["name", "date_start", "date", "ultimate_duration", "baseline_start_date", "baseline_end_date", "cost", "complexity"]);
        const pIds = res.map(p => p.id);
        let tasks = [];
        if (pIds.length > 0) tasks = await this.orm.searchRead("project.task", [["project_id", "in", pIds]], ["name", "project_id", "planned_date_begin", "date_deadline", "actual_progress", "gantt_color", "depend_on_ids", "inactive_dependency_ids", "parent_id", "user_ids", "sequence", "stage_id", "baseline_start_date", "baseline_end_date", "baseline2_start_date", "baseline2_end_date", "baseline3_start_date", "baseline3_end_date", "baseline_duration", "effort", "scheduling_mode", "constraint_type", "constraint_date", "manually_scheduled", "rollup", "inactive", "calendar_id", "ignore_resource_calendar", "effort_driven", "project_border", "description", "cost", "complexity", "is_milestone"], { order: "sequence ASC" });
        const allUsers = await this.orm.searchRead("res.users", [], ["name", "image_128"]);
        let calDomain = [];
        if (params && params.context) {
            const allowed = params.context.allowed_company_ids;
            if (Array.isArray(allowed) && allowed.length > 0) {
                calDomain = ["|", ["company_id", "=", false], ["company_id", "in", allowed]];
            } else if (params.context.company_id) {
                calDomain = ["|", ["company_id", "=", false], ["company_id", "=", params.context.company_id]];
            }
        }
        const allCalendars = await this.orm.searchRead("resource.calendar", calDomain, ["name", "hours_per_day"], { context: params.context || {} });
        this.allUsers = allUsers;
        this.allCalendars = allCalendars;
        this.allTasksList = tasks.map(t => ({ id: t.id, name: t.name }));
        let dependencyMap = {};
        if (tasks.length > 0) {
            const allTaskIds = tasks.map(t => t.id);
            try {
                const depRecords = await this.orm.searchRead(
                    "project.task.dependency", 
                    [["task_id", "in", allTaskIds]], 
                    ["task_id", "depends_on_id", "dependency_type", "lag"]
                );
                depRecords.forEach(d => {
                    const tId = Array.isArray(d.task_id) ? d.task_id[0] : d.task_id;
                    const pId = Array.isArray(d.depends_on_id) ? d.depends_on_id[0] : d.depends_on_id;
                    dependencyMap[`${tId}_${pId}`] = (d.dependency_type || 'fs').toUpperCase();
                });
            } catch (err) {
                console.error("Error loading task dependencies relation:", err);
            }
        }
        this.dependencyMap = dependencyMap;
        const now = DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss");
        const uids = [...new Set(tasks.flatMap(t => t.user_ids || []))];
        let uMap = {}; if (uids.length > 0) { const users = await this.orm.searchRead("res.users", [["id", "in", uids]], ["name", "image_128"]); users.forEach(u => uMap[u.id] = u); }
        this.data = res.map((p, idx) => {
            let pS = p.date_start || now;
            let tks = tasks.filter(t => t.project_id && t.project_id[0] === p.id).map(t => {
                let s = t.planned_date_begin || pS, e = t.date_deadline || deserializeDateTime(s).plus({ days: 1 }).toFormat("yyyy-MM-dd HH:mm:ss");
                const diff = deserializeDateTime(e).diff(deserializeDateTime(s), ['days', 'hours']).toObject();
                const assignees = (t.user_ids || []).map(uId => uMap[uId]).filter(x => x);
                const isMs = t.is_milestone || (s === e);
                return { ...t, is_milestone: isMs, planned_date_begin: s, date_deadline: e, real_duration: diff.days > 0 ? `${Math.round(diff.days)}d ${Math.round(diff.hours || 0)}h` : `${Math.round(diff.hours || 0)}h`, assignee_names: assignees.map(u => u.name).join(', '), assignees: assignees };
            });
            let treeMap = {}; tks.forEach(t => { t.children = []; treeMap[t.id] = t; });
            let tree = []; tks.forEach(t => { if (t.parent_id && treeMap[t.parent_id[0]]) treeMap[t.parent_id[0]].children.push(t); else tree.push(t); });
            // Always sort children by sequence to guarantee correct WBS order
            // even if Odoo auto-resequences tasks when dates change.
            const sortBySeq = nodes => nodes.sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.id - b.id);
            sortBySeq(tree);
            Object.values(treeMap).forEach(node => { if (node.children.length > 1) sortBySeq(node.children); });
            let flat = []; let trav = (nodes, d, pb) => nodes.forEach((n, i) => {
                let wbs = pb + '.' + (i + 1); n.depth = d; n.computed_wbs = wbs; flat.push(n);
                if (n.children && n.children.length > 0) {
                    trav(n.children, d + 1, wbs);
                    // Rollup parent dates
                    const cStarts = n.children.map(c => deserializeDateTime(c.planned_date_begin).ts);
                    const cEnds = n.children.map(c => deserializeDateTime(c.date_deadline).ts);
                    n.planned_date_begin = serializeDateTime(DateTime.fromMillis(Math.min(...cStarts)));
                    n.date_deadline = serializeDateTime(DateTime.fromMillis(Math.max(...cEnds)));
                    n.is_milestone = (n.planned_date_begin === n.date_deadline);
                }
            });
            trav(tree, 0, (idx + 1).toString());

            // Compute Relationships
            flat.forEach(t => {
                t.predecessor_wbs = (t.depend_on_ids || []).map(id => treeMap[id]?.computed_wbs).filter(x => x).join(', ') || '-';
                t.successor_wbs = flat.filter(st => (st.depend_on_ids || []).includes(t.id)).map(st => st.computed_wbs).join(', ') || '-';
            });

            // Rollup Project dates
            let pStart = pS, pEnd = p.date || deserializeDateTime(pS).plus({ days: 7 }).toFormat("yyyy-MM-dd HH:mm:ss");
            let pCost = p.cost || 0;
            let pComplex = p.complexity || 'normal';
            if (flat.length > 0) {
                const fStarts = flat.map(t => deserializeDateTime(t.planned_date_begin).ts);
                const fEnds = flat.map(t => deserializeDateTime(t.date_deadline).ts);
                pStart = serializeDateTime(DateTime.fromMillis(Math.min(...fStarts)));
                pEnd = serializeDateTime(DateTime.fromMillis(Math.max(...fEnds)));
                pCost = flat.reduce((acc, t) => acc + (t.cost || 0), 0);
            }
            return { ...p, id: `proj_${p.id}`, r_id: p.id, computed_wbs: (idx + 1).toString(), tasks: flat, planned_date_begin: pStart, date_deadline: pEnd, real_duration: p.ultimate_duration || "-", cost: pCost, complexity: pComplex };
        });
        this._computeCP();
        this.allTasksList = this.data.flatMap(p => p.tasks || []).map(t => ({ id: t.id, name: t.name, computed_wbs: t.computed_wbs }));
        return this.data;
    }
    _computeCP() {
        (this.data || []).forEach(p => {
            let tasks = p.tasks || []; if (!tasks.length) return;
            
            // Step 1: Initialize ES (Early Start) and EF (Early Finish) from the current schedule
            let idMap = {};
            tasks.forEach(t => {
                t.isCritical = false;
                t._es = deserializeDateTime(t.planned_date_begin).ts;
                t._ef = deserializeDateTime(t.date_deadline).ts;
                t._dur = t._ef - t._es;
                t._succs = []; 
                idMap[t.id] = t;
            });
            
            // Build successors list based on depend_on_ids
            tasks.forEach(t => {
                (t.depend_on_ids || []).forEach(predId => {
                    if (idMap[predId]) {
                        idMap[predId]._succs.push(t.id);
                    }
                });
            });

            // Project end is the absolute maximum Early Finish across all tasks in this project
            let pEnd = Math.max(...tasks.map(t => t._ef));

            // Step 2: Backward pass to calculate LF (Late Finish)
            // LF = min(LS of all successors) or pEnd if no successors
            const getLF = (taskId) => {
                const t = idMap[taskId];
                if (t._lf !== undefined) return t._lf;
                if (t._processing) return pEnd; // Cycle detection guard
                t._processing = true;
                
                if (t._succs.length === 0) {
                    t._lf = pEnd;
                } else {
                    let minSuccLS = Infinity;
                    t._succs.forEach(succId => {
                        const succ = idMap[succId];
                        let succLS = getLF(succId) - succ._dur;
                        if (succLS < minSuccLS) minSuccLS = succLS;
                    });
                    t._lf = minSuccLS === Infinity ? pEnd : minSuccLS;
                }
                t._processing = false;
                return t._lf;
            };

            tasks.forEach(t => {
                let lf = getLF(t.id);
                t._ls = lf - t._dur;
                let totalSlackMs = lf - t._ef;
                t.total_slack = totalSlackMs / 3600000; // Store total slack in hours for reference
                
                // Critical Rule: Total Slack is exactly 0 (allow 1 hour float tolerance for JS rounding)
                if (totalSlackMs <= 3600000) {
                    t.isCritical = true;
                }
            });

            // Step 3: Summary Parent Tasks - mark as critical if ANY child is critical
            tasks.forEach(t => {
                if (t.children && t.children.length > 0) {
                    const checkCrit = (node) => {
                        if (node.isCritical && (!node.children || node.children.length === 0)) return true;
                        if (node.children) return node.children.some(c => checkCrit(c));
                        return false;
                    };
                    if (t.children.some(c => checkCrit(c))) {
                        t.isCritical = true;
                    }
                }
            });

            p.isCritical = tasks.some(t => t.isCritical);
        });
    }
    async onNewTask() {
        let pId = null, prId = null;
        if (this.sId) {
            if (String(this.sId).startsWith('proj_')) prId = parseInt(this.sId.split('_')[1]);
            else {
                let p = (this.data || []).find(px => px.tasks.find(t => t.id === this.sId));
                if (p) { let t = p.tasks.find(x => x.id === this.sId); pId = t.id; prId = t.project_id[0]; }
            }
        }
        if (!prId && this.data?.[0]) prId = this.data[0].r_id;
        if (prId) await this.action.doAction({ type: "ir.actions.act_window", res_model: "project.task", view_mode: "form", views: [[false, "form"]], target: "new", context: { default_project_id: prId, default_parent_id: pId, default_planned_date_begin: serializeDateTime(DateTime.now()) }, on_close: () => this.load(this.params) });
    }
}

export class UltimateGanttRenderer extends Component {
    static components = { DateTimeInput };
    static template = xml`
        <div t-attf-class="h-100 d-flex flex-column bg-view o_ultimate_gantt_renderer {{ state.config.gantt_dark_mode ? 'o_ug_dark_mode' : '' }} {{ state.config.gantt_hide_schedule ? 'o_ug_hide_schedule' : '' }} {{ state.config.gantt_show_column_lines === false ? 'o_ug_hide_column_lines' : '' }} {{ state.config.gantt_show_row_lines === false ? 'o_ug_hide_row_lines' : '' }}" t-ref="mainRef" t-on-mousemove="this.onMM">
            <style>
                .o_ug_toolbar { background: #ffffff; padding: 10px 24px; border-bottom: 2px solid #dee2e6; display: flex; align-items: center; gap: 8px; position: sticky; top: 0; z-index: 100; flex-shrink: 0; min-height: 56px !important; }
                .o_ug_btn { height: 34px; border: 1px solid #cbd5e0; background: #fff; padding: 0 12px; border-radius: 6px; font-size: 13px; font-weight: 700; color: #4a5568; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: 0.1s; }
                .o_ug_btn:hover:not(:disabled) { background: #f8fafc; border-color: #71639e; color: #71639e; }
                .o_ug_divider { width: 1px; height: 22px; background: #e2e8f0; margin: 0 6px; }
                .o_ug_date_range_picker { border: 1px solid #cbd5e0; border-radius: 6px; height: 34px; padding: 0 12px; display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; cursor: pointer; background: #fff; min-width: 140px; color: #1a202c; transition: 0.1s; justify-content: center; }

                .o_ug_popover_base { position: absolute; top: 45px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1000; padding: 8px 0; }
                .o_ug_date_popover { left: 0; width: 300px; }
                .o_ug_settings_popover { left: 24px; width: 280px; max-height: 400px; overflow-y: auto; overflow-x: hidden; }

                .o_ug_settings_category { padding: 10px 20px; font-size: 12px; font-weight: 800; color: #1e293b; cursor: pointer; display: flex; align-items: center; border-bottom: 1px solid #f1f5f9; transition: 0.1s; background: #fff; }
                .o_ug_settings_category:hover { background: #f8fafc; color: #71639e; }
                .o_ug_settings_group { background: #f8fafc; }

                .o_ug_slider_plain { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 5px; background: #e2e8f0; outline: none; margin: 10px 0; }
                .o_ug_slider_plain::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #71639e; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }

                .o_ug_date_item { padding: 8px 20px; font-size: 13px; font-weight: 600; color: #4a5568; cursor: pointer; transition: 0.1s; }
                .o_ug_date_item:hover { background: #f1f5f9; color: #71639e; }
                .o_ug_date_custom { padding: 16px 20px; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 10px; background: #f8fafc; }
                .o_ug_date_input_group { display: flex; flex-direction: column; gap: 4px; font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
                .o_ug_date_field { border: 1px solid #cbd5e0; border-radius: 4px; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 700; color: #1a202c; width: 100%; }
                .o_ug_date_apply_btn { background: #71639e; color: white; border: none; border-radius: 4px; height: 34px; font-size: 12px; font-weight: 800; cursor: pointer; }

                .o_ug_header_bar { background: #f8fafc; border-bottom: 1.5px solid #cbd5e0; position: sticky; top: 0; z-index: 90; flex-shrink: 0; display: flex; flex-direction: column; width: max-content; }
                .o_ug_ht_label_grouped { height: 30px; display: flex; align-items: center; justify-content: flex-start; padding-left: 14px; font-size: 11px; font-weight: 700; color: #64748b; background: white; border-bottom: 1px solid #e2e8f0; text-transform: capitalize; border-right: 1px solid #f1f5f9; }
                .o_ug_ht_day_row { display: flex; height: 35px; border-bottom: 1px solid #f1f5f9; background: white; position: relative; }
                .o_ug_ht_day_cell { flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #1e293b; border-right: 1px solid #f1f5f9; }
                .o_ug_ht_day_cell.o_ug_cell_now { border-bottom: 2.5px solid #71639e !important; color: #71639e !important; background: #f0f4ff; }
                .o_ug_weekend_header { background: #f1f5f9 !important; }

                .o_ug_row { position: relative; border-bottom: 1px solid #f1f5f9; background: #fff; display: flex; align-items: center; font-size: 13px; flex-shrink: 0; transition: height 0.1s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden !important; }
                .o_ug_project_row { background: #f8fafc !important; font-weight: 900; color: #1a202c; border-bottom: 1.5 solid #e2e8f0 !important; }
                .o_ug_row_hover { background: #f1f5f9 !important; }
                .o_ug_sidebar_col { border-right: 1px solid #dee2e6; display: flex; align-items: center; padding: 0 12px; flex-shrink: 0; font-size: 11px; overflow: hidden; height: 100%; transition: height 0.1s; }

                .o_ug_grid_layer { position: absolute; top: 0; left: 0; height: 100%; display: flex; pointer-events: none; z-index: 1; width: 100%; }
                .o_ug_grid_col { border-right: 1px solid rgba(226, 232, 240, 0.5); flex: 1 0 0%; height: 100%; }
                .o_ug_weekend_col { background: rgba(241, 245, 249, 0.8); }

                .o_ug_hide_column_lines .o_ug_grid_col { border-right: none !important; }
                .o_ug_hide_row_lines .o_ug_row { border-bottom: none !important; }
                .o_ug_hide_row_lines .o_ug_project_row { border-bottom: none !important; }

                .o_ug_today_line { position: absolute; width: 0; border-left: 1.5px solid #ef4444; height: calc(100% + 35px); top: -35px; z-index: 50; pointer-events: none; }
                .o_ug_today_line::before { content: ""; position: absolute; top: 35px; left: -3.5px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 5px rgba(239, 68, 68, 0.5); }

                .o_ug_progress_line_svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 55; }
                .o_ug_progress_line_path { stroke: #ef4444; stroke-width: 2.5; fill: none; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.3)); }

                .o_ug_project_marker_line { position: absolute; width: 0; border-left: 2px solid #f59e0b; height: 3000px; top: 0; z-index: 75; }
                .o_ug_project_marker_label { position: absolute; top: 0; left: 0; background: #f59e0b; color: white; padding: 2px 8px; font-size: 8px; font-weight: 800; border-radius: 4px 4px 0 0; white-space: nowrap; transform: translate(-50%, -100%); z-index: 80; pointer-events: none; text-transform: uppercase; line-height: 1.2; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }

                .o_gantt_pill_wrapper { position: absolute; display: flex; align-items: center; z-index: 5; height: 100%; transition: all 0.1s; }
                .o_gantt_pill_wrapper.o_ug_summary { height: 10px; border-radius: 0; clip-path: polygon(0% 0%, 100% 0%, 100% 100%, calc(100% - 6px) 50%, 6px 50%, 0% 100%); border: none; background: #475569 !important; z-index: 12; transition: background 0.3s ease; }
                .o_gantt_pill_wrapper.o_ug_summary.o_ug_summary_critical { background: #d9534f !important; }
                                 .o_gantt_pill_wrapper.o_ug_project_summary { height: 10px !important; border-radius: 0; clip-path: polygon(0% 0%, 100% 0%, 100% 100%, calc(100% - 6px) 50%, 6px 50%, 0% 100%) !important; background: #1e293b !important; z-index: 13; }

                .o_gantt_pill { border-radius: 4px; border: none; box-shadow: none !important; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; overflow: hidden; position: relative; }
                .o_ug_custom_color::before { content: ''; position: absolute; inset: 0; background: rgba(255,255,255, 0.7); z-index: 1; pointer-events: none; }
                .o_ug_custom_color .o_gantt_progress { background-color: var(--pill-color) !important; z-index: 2; opacity: 0.45 !important; }
                .o_ug_custom_color .o_gantt_pill_title { z-index: 3; }
                .o_gantt_pill:hover { filter: brightness(0.95); }
                .o_gantt_progress { background: rgba(0,0,0,0.2); height: 100%; position: absolute; top: 0; left: 0; pointer-events: none; }
                .o_gantt_pill_title { font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 3; pointer-events: none; }

                .o_gantt_group_pill { pointer-events: none; }
                .o_gantt_group_pill .o_gantt_pill_title { background: #f8fafc; color: #475569; position: sticky; left: 0; padding: 0 4px; box-shadow: 0 0 10px rgba(255,255,255,0.8); border-radius: 2px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
                .o_gantt_consolidated_pill { height: 12px; background: #cbd5e1; border: none !important; opacity: 0.6; }

                .o_gantt_pill_tan { background: #f7e6d2; color: #7c4a1b !important; }
                .o_gantt_pill_tan .o_gantt_progress { background: #e9c4a0; opacity: 0.5; }
                .o_gantt_pill_tan .o_gantt_pill_title { color: #5d3a1a; }

                .o_gantt_pill_critical { background: #d9534f !important; color: white !important; }
                .o_gantt_pill_critical .o_gantt_progress { background: #b94441 !important; opacity: 0.6; }
                .o_gantt_pill_critical .o_gantt_pill_title { color: white !important; }

                .o_ug_dep_handle { width: 12px; height: 12px; background: white; border: 2.5px solid #71639e; border-radius: 50%; position: absolute; z-index: 100; top: 50%; transform: translateY(-50%); opacity: 0; transition: opacity 0.2s, transform 0.2s; cursor: crosshair !important; pointer-events: auto !important; }
                .o_gantt_pill:hover .o_ug_dep_handle, .o_gantt_pill_wrapper:hover .o_ug_dep_handle { opacity: 1; }
                .o_ug_dep_handle:hover { transform: translateY(-50%) scale(1.3); border-color: #22c55e; }
                .o_ug_handle_l { left: -6px; }
                .o_ug_handle_r { right: -6px; }

                                 .o_ug_baseline_pill { position: absolute; height: 4px; background: rgba(0,0,0,0.1); border-radius: 2px; bottom: -6px; pointer-events: none; z-index: 4; }
                .o_ug_baseline_summary { height: 6px; background: rgba(0,0,0,0.1) !important; z-index: 4; position: absolute; bottom: -8px; clip-path: polygon(0% 0%, 100% 0%, 100% 100%, calc(100% - 6px) 50%, 6px 50%, 0% 100%); }


                .o_ug_modal_overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.45); -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important; display: flex; align-items: center; justify-content: center; z-index: 5000; animation: fadeIn 0.2s ease-out; }
                .o_ug_custom_dropdown_menu { border: 1px solid #cbd5e1 !important; border-radius: 8px !important; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; background: #ffffff !important; font-family: inherit; animation: o_ug_dropdown_in 0.15s ease-out; }
                @keyframes o_ug_dropdown_in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
                .o_ug_custom_dropdown_item { font-size: 13px !important; color: #334155 !important; padding: 8px 16px !important; transition: all 0.15s ease; display: flex; align-items: center; justify-content: space-between; text-align: left; }
                .o_ug_custom_dropdown_item:hover { background-color: #f1f5f9 !important; color: #0f172a !important; }
                .o_ug_custom_dropdown_item.active { background-color: #f1f5f9 !important; color: #71639e !important; font-weight: 600; }
                .o_ug_type_select {
                    background-color: #f8fafc !important;
                    border: 1px solid #e2e8f0 !important;
                    border-radius: 8px !important;
                    padding: 6px 12px !important;
                    font-size: 13px !important;
                    font-weight: 500 !important;
                    color: #475569 !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease !important;
                    outline: none !important;
                    display: inline-block;
                }
                .o_ug_type_select:hover {
                    border-color: #cbd5e1 !important;
                    background-color: #f1f5f9 !important;
                    color: #1e293b !important;
                }
                .o_ug_type_select:focus {
                    border-color: #71639e !important;
                    box-shadow: 0 0 0 3px rgba(113,99,158,0.1) !important;
                }
                .o_ug_modal { background: white; border-radius: 12px; width: 750px; max-width: 95vw; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; overflow: hidden; animation: o_ug_modal_in 0.25s cubic-bezier(0,0,0.2,1); }
                @keyframes o_ug_modal_in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .o_ug_modal_header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #fff; }
                .o_ug_modal_tabs { display: flex; gap: 28px; padding: 0 24px; border-bottom: 1px solid #f1f5f9; background: #fff; }
                .o_ug_modal_tab { padding: 12px 0; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; position: relative; transition: 0.2s; }
                .o_ug_modal_tab:hover { color: #1e293b; }
                .o_ug_modal_tab.active { color: #71639e; }
                .o_ug_modal_tab.active::after { content: ""; position: absolute; bottom: -1px; left: 0; width: 100%; height: 2.5px; background: #71639e; border-radius: 2px; }

                .o_ug_modal_body { padding: 24px; overflow: visible; max-height: 70vh; background: #fff; }
                .o_ug_modal_footer { padding: 16px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; background: #f8fafc; }

                .o_ug_input_group { margin-bottom: 16px; }
                .o_ug_input_label { display: block; font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
                .o_ug_input { width: 100%; height: 38px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0 12px; font-size: 14px; font-weight: 600; color: #1e293b; transition: 0.2s; }
                .o_ug_input:focus { border-color: #71639e; outline: none; box-shadow: 0 0 0 3px rgba(113,99,158,0.1); }

                .o_ug_table { width: 100%; border-collapse: collapse; }
                .o_ug_table th { text-align: left; padding: 10px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #f1f5f9; }
                .o_ug_table td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; }

                .o_ug_modal_header { padding: 20px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
                .o_ug_modal_body { padding: 24px; display: flex; flex-direction: column; gap: 20px; min-height: 480px; height: 480px; overflow: visible; }
                .o_ug_modal_footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; gap: 12px; justify-content: flex-end; }
                .o_ug_input_group { display: flex; flex-direction: column; gap: 6px; }
                .o_ug_input_label { font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
                .o_ug_input { padding: 10px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s; outline: none; }
                .o_ug_input:focus { border-color: #4285F4; box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.1); }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

                .o_ug_total_row { background: #fff; height: 40px; border-top: 2px solid #e2e8f0; display: flex; position: sticky; bottom: 0; z-index: 70; }
                .o_ug_total_cell { flex-shrink: 0; display: flex; align-items: flex-end; justify-content: center; position: relative; }
                .o_ug_total_bar { background: #cbd5e1; width: 100%; transition: height 0.3s; display: flex; align-items: flex-start; justify-content: center; font-size: 9px; font-weight: 900; color: #475569; padding-top: 2px; }

                .o_ug_dep_svg { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 10; overflow: visible; }
                .o_ug_drag_svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2000; overflow: visible; }

                .o_ug_dep_tooltip { position: fixed; background: white; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); z-index: 3000; font-size: 11px; font-family: 'Outfit', sans-serif; pointer-events: none; min-width: 200px; display: grid; grid-template-columns: 45px 1fr; row-gap: 8px; column-gap: 12px; }
                .o_ug_tooltip_label { font-weight: 800; color: #94a3b8; text-transform: uppercase; font-size: 10px; display: flex; align-items: center; }
                .o_ug_tooltip_val { font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; }

                .o_ug_context_menu { position: fixed; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); min-width: 180px; z-index: 6000; padding: 6px 0; font-family: 'Outfit', sans-serif; display: flex; flex-direction: column; }
                .o_ug_context_menu_item { padding: 10px 16px; font-size: 13px; font-weight: 500; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s; }
                .o_ug_context_menu_item:hover:not(.disabled) { background: #f1f5f9; color: #0f172a; }
                .o_ug_context_menu_item.disabled { color: #cbd5e1; cursor: not-allowed; }
                .o_ug_context_menu_item.disabled:hover { background: transparent; color: #cbd5e1; }
                .o_ug_has_submenu { position: relative; }
                .o_ug_context_submenu { display: none; position: absolute; left: 100%; bottom: -5px; top: auto; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); padding: 5px 0; min-width: 160px; z-index: 1001; }
                .o_ug_has_submenu:hover > .o_ug_context_submenu { display: block; }
                .o_ug_color_submenu { display: none; position: absolute; left: 100%; bottom: -15px; top: auto; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.15); padding: 10px; z-index: 1001; }
                .o_ug_has_submenu:hover > .o_ug_color_submenu { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
                .o_ug_color_swatch { width: 22px; height: 22px; border-radius: 4px; cursor: pointer; border: 2px solid transparent; transition: transform 0.15s, border-color 0.15s; box-sizing: border-box; }
                .o_ug_color_swatch:hover { transform: scale(1.2); border-color: rgba(0,0,0,0.3); }
                .o_ug_color_swatch.o_ug_color_selected { border-color: #1e293b !important; box-shadow: 0 0 0 1px white inset; }
                .o_ug_color_none { background: white; border: 2px solid #cbd5e1 !important; position: relative; }
                .o_ug_color_none::after { content: ''; position: absolute; top: 50%; left: 50%; width: 70%; height: 2px; background: #ef4444; transform: translate(-50%, -50%) rotate(-45deg); border-radius: 2px; }
                .o_ug_color_divider { grid-column: 1 / -1; height: 1px; background: #e2e8f0; margin: 2px 0; }

                /* Milestone Diamond */
                .o_ug_milestone_diamond { display: block !important; position: absolute !important; left: 0 !important; top: 50% !important; margin-top: -9px !important; width: 18px !important; height: 18px !important; background-color: var(--ug-milestone-color, #4285F4) !important; transform: rotate(45deg) !important; border-radius: 2px !important; z-index: 100 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important; }
                .o_ug_context_menu_divider { height: 1px; background: #e2e8f0; margin: 4px 0; }

                .o_ug_main_flex { flex: 1 1 0%; min-height: 0; display: flex; overflow: hidden; }
                .o_ug_search_integrated { background: #f8fafc; border: 1px solid #cbd5e0; border-radius: 6px; display: flex; align-items: center; height: 34px; width: 320px; padding: 0 12px; position: relative; gap: 8px; }
                .o_ug_search_input_final { border: none !important; background: transparent !important; box-shadow: none !important; padding: 0 !important; font-size: 13px; font-weight: 600; color: #1a202c; height: 100%; width: 100%; outline: none; }
                .o_ug_timeline_viewport { flex-grow: 1; display: flex; flex-direction: column; overflow-x: auto; overflow-y: auto; position: relative; background: var(--ug-bg, #f1f5f9); scrollbar-width: thin; }
                .o_ug_grid_only .o_ug_timeline_viewport, .o_ug_hide_schedule .o_ug_timeline_viewport { width: 0 !important; flex-grow: 0 !important; overflow: hidden !important; border: none !important; }
                .o_ug_grid_only .o_ug_sidebar, .o_ug_hide_schedule .o_ug_sidebar { width: 100% !important; flex-grow: 1; }
                .o_ug_timeline_only .o_ug_sidebar { width: 0 !important; flex-grow: 0 !important; overflow: hidden !important; border: none !important; }

                .o_ug_splitter { width: 6px; background: #cbd5e0; cursor: col-resize; position: relative; z-index: 100; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s; }
                .o_ug_splitter:hover { background: #71639e; }
                .o_ug_splitter_btn_combined { width: 32px; height: 32px; background: #f8fafc; border: 1px solid #cbd5e0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #64748b; cursor: pointer; position: absolute; box-shadow: 0 2px 6px rgba(0,0,0,0.1); z-index: 101; transition: 0.2s; gap: 2px; top: 50%; transform: translateY(-50%); position: sticky; margin-left: -16px; left: 50%; }
                .o_ug_hide_schedule .o_ug_splitter_btn_combined { position: fixed !important; right: 0 !important; left: auto !important; border-radius: 20px 0 0 20px !important; width: 20px !important; height: 40px !important; margin-left: 0 !important; border-right: none !important; z-index: 5000 !important; }
                .o_ug_timeline_only .o_ug_splitter_btn_combined { position: fixed !important; left: 0 !important; right: auto !important; border-radius: 0 20px 20px 0 !important; width: 20px !important; height: 40px !important; margin-left: 0 !important; border-left: none !important; z-index: 5000 !important; }
                .o_ug_splitter_btn_combined:hover { border-color: #71639e; transform: scale(1.1) translateY(-50%); color: #71639e; box-shadow: 0 4px 10px rgba(0,0,0,0.15); background: white; }
                .o_ug_splitter_btn_combined i { font-size: 14px; pointer-events: none; }

                .o_ug_sidebar_horizontal { flex-grow: 1; display: flex; flex-direction: column; overflow-x: auto; overflow-y: hidden; background: white; scrollbar-width: thin; position: relative; }
                .o_ug_sidebar_scroll_content { width: max-content; min-width: 100%; display: flex; flex-direction: column; height: 100%; }
                .o_ug_sidebar_sync { overflow-y: auto !important; overflow-x: hidden !important; flex-grow: 1; scrollbar-width: none; width: 100%; }
                .o_ug_sidebar_sync::-webkit-scrollbar { display: none; }
                .o_ug_hide_schedule .o_ug_sidebar_sync { scrollbar-width: thin !important; }
                .o_ug_sidebar_sync::-webkit-scrollbar { display: block !important; width: 6px; }

                .o_ug_header_bar_fixed { position: sticky; top: 0; z-index: 70; background: #f8fafc; width: max-content; min-width: 100%; border-bottom: 1.5px solid #cbd5e0; }

                .o_ug_sidebar_horizontal::-webkit-scrollbar { height: 6px; }
                .o_ug_sidebar_horizontal::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 10px; }
                .o_ug_timeline_viewport::-webkit-scrollbar { width: 8px; height: 6px; }
                .o_ug_timeline_viewport::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 10px; }
                .o_ug_date_input_group { display: flex; flex-direction: column; gap: 4px; font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }

                .o_ug_cell_editor { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 2px solid #71639e !important; border-radius: 4px; padding: 0 8px; font-size: 11px; font-weight: 600; outline: none; background: white; z-index: 200; box-shadow: 0 0 8px rgba(113, 99, 158, 0.2); }

                .o_ug_tooltip { position: fixed; background: rgba(255, 255, 255, 0.98); border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); z-index: 10000; pointer-events: none; width: 220px; font-family: 'Outfit', sans-serif; backdrop-filter: blur(8px); animation: tooltipFade 0.15s ease-out; }
                .o_ug_tooltip_header { font-weight: 800; font-size: 13px; color: #1e293b; margin-bottom: 12px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .o_ug_tooltip_row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
                .o_ug_tooltip_label { color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
                .o_ug_tooltip_val { color: #1e293b; font-weight: 800; }
                @keyframes tooltipFade { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

                /* DARK MODE OVERRIDES */
                .o_ug_dark_mode { --ug-bg: #1e293b; --ug-text: #f8fafc; --ug-sidebar: #0f172a; --ug-row-border: #334155; --ug-grid-border: rgba(255,255,255,0.05); }
                .o_ug_dark_mode .o_ug_sidebar, .o_ug_dark_mode .o_ug_toolbar, .o_ug_dark_mode .o_ug_header_bar { background: var(--ug-sidebar) !important; color: var(--ug-text); border-color: var(--ug-row-border) !important; }
                .o_ug_dark_mode .o_ug_row { background: var(--ug-sidebar) !important; border-bottom-color: var(--ug-row-border) !important; color: var(--ug-text); }
                .o_ug_dark_mode .o_ug_grid_col { border-right-color: var(--ug-grid-border) !important; }
                .o_ug_dark_mode .o_ug_versions_sidebar { background: var(--ug-sidebar) !important; border-left-color: var(--ug-row-border); color: var(--ug-text); }
                .o_ug_dark_mode .o_ug_version_card { border-bottom-color: var(--ug-row-border); }
                .o_ug_dark_mode .o_ug_version_card:hover { background: rgba(255,255,255,0.05); }
                .o_ug_dark_mode .o_ug_modal { background: #1e293b; color: white; }
                .o_ug_dark_mode .o_ug_modal_header, .o_ug_dark_mode .o_ug_modal_footer { background: #0f172a; border-color: #334155; }
                .o_ug_dark_mode .o_ug_input { background: #334155; border-color: #475569; color: white; }

                .o_ug_versions_sidebar { width: 320px; border-left: 1.5px solid #e2e8f0; background: white; display: flex; flex-direction: column; animation: slideInRight 0.3s ease-out; z-index: 60; }
                .o_ug_version_card { padding: 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s; position: relative; }
                .o_ug_version_card:hover { background: #f8fafc; }
                .o_ug_version_active { border-left: 4px solid #4285F4; background: #eff6ff !important; }
                .o_ug_version_title { font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }
                .o_ug_version_meta { font-size: 10px; color: #64748b; display: flex; align-items: center; gap: 8px; font-weight: 600; }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            
            .hover-bg-light:hover { background-color: #f1f5f9 !important; }
</style>

            <div class="o_ug_toolbar" t-ref="toolbar">
                <div class="position-relative" t-ref="settingsWrapper">
                    <button class="o_ug_btn shadow-sm" t-on-click="() => state.settingsOpen = !state.settingsOpen">
                        <i class="fa fa-cog me-1"/> SETTINGS <i t-attf-class="fa {{ state.settingsOpen ? 'fa-caret-up' : 'fa-caret-down' }} ms-1"/>
                    </button>
                    <t t-if="state.settingsOpen">
                        <div class="o_ug_popover_base o_ug_settings_popover shadow-lg">
                            <div class="o_ug_settings_category" t-on-click="() => state.uiSettingsOpen = !state.uiSettingsOpen">
                                <i class="fa fa-television me-2 text-primary"/> UI SETTINGS <i t-attf-class="fa {{ state.uiSettingsOpen ? 'fa-angle-down' : 'fa-angle-right' }} ms-auto"/>
                            </div>
                            <t t-if="state.uiSettingsOpen">
                                <div class="o_ug_settings_group px-4 py-3 border-bottom shadow-inner">
                                    <div class="d-flex flex-column gap-1">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <label class="fw-bold text-muted" style="font-size: 10px;">ROW HEIGHT</label>
                                            <span class="badge bg-light text-dark"><t t-esc="state.config.gantt_row_height"/>px</span>
                                        </div>
                                        <input type="range" min="30" max="100" step="2" class="o_ug_slider_plain" t-model.number="state.config.gantt_row_height" t-on-change="this.saveConfig"/>

                                        <div class="d-flex justify-content-between align-items-center mt-2">
                                            <label class="fw-bold text-muted" style="font-size: 10px;">BAR MARGINS</label>
                                            <span class="badge bg-light text-dark"><t t-esc="state.config.gantt_bar_margin"/>px</span>
                                        </div>
                                        <input type="range" min="0" max="25" class="o_ug_slider_plain" t-att-value="25 - state.config.gantt_bar_margin" t-on-input="this.onBarMarginInput"/>
                                        <div class="d-flex justify-content-between opacity-50" style="font-size: 8px; font-weight: 800;">
                                            <span>LEFT: INCREASE</span>
                                            <span>RIGHT: DECREASE</span>
                                        </div>

                                        <div class="d-flex align-items-center mt-3">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">TASK LABELS</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_labels" t-on-change="() => { state.config.gantt_show_labels = !state.config.gantt_show_labels; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>

                                         <div class="d-flex align-items-center mt-2">
                                             <label class="fw-bold text-muted me-auto" style="font-size: 10px;">HIDE SCHEDULE</label>
                                             <div class="form-check form-switch m-0">
                                                 <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_hide_schedule" t-on-change="this.toggleHideSchedule" style="cursor: pointer;"/>
                                             </div>
                                         </div>

                                         <div class="d-flex align-items-center mt-2">
                                             <label class="fw-bold text-muted me-auto" style="font-size: 10px;">COLUMN WIDTH</label>
                                             <span class="badge bg-light text-dark me-2"><t t-esc="state.config.gantt_col_w"/>px</span>
                                             <input type="range" min="30" max="300" step="5" class="o_ug_slider_plain" style="width: 100px;" t-model.number="state.config.gantt_col_w" t-on-change="this.saveConfig"/>
                                         </div>

                                         <div class="d-flex align-items-center mt-2">
                                             <label class="fw-bold text-muted me-auto" style="font-size: 10px;">CRITICAL PATH</label>
                                             <div class="form-check form-switch m-0">
                                                 <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_critical_path" t-on-change="() => { state.config.gantt_show_critical_path = !state.config.gantt_show_critical_path; this.saveConfig(); }" style="cursor: pointer;"/>
                                             </div>
                                         </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">PROJECT LINES</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_project_lines" t-on-change="() => { state.config.gantt_show_project_lines = !state.config.gantt_show_project_lines; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">HIGHLIGHT NON-WORKING TIME</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_highlight_non_working_time" t-on-change="() => { state.config.gantt_highlight_non_working_time = !state.config.gantt_highlight_non_working_time; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">DEPENDENCY TYPE</label>
                                            <select class="form-select form-select-sm m-0" style="width: auto; font-size: 10px;" t-model="state.config.gantt_dependency_type" t-on-change="this.saveConfig">
                                                <option value="FS">Finish-to-Start (FS)</option>
                                                <option value="SS">Start-to-Start (SS)</option>
                                                <option value="FF">Finish-to-Finish (FF)</option>
                                                <option value="SF">Start-to-Finish (SF)</option>
                                            </select>
                                        </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">DRAW DEPENDENCIES</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_enable_dep_draw" t-on-change="() => { state.config.gantt_enable_dep_draw = !state.config.gantt_enable_dep_draw; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">SHOW BASELINES</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_baselines" t-on-change="() => { state.config.gantt_show_baselines = !state.config.gantt_show_baselines; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">DARK MODE</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_dark_mode" t-on-change="() => { state.config.gantt_dark_mode = !state.config.gantt_dark_mode; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">INLINE EDITING</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_enable_cell_editing" t-on-change="() => { state.config.gantt_enable_cell_editing = !state.config.gantt_enable_cell_editing; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">SHOW PROGRESS LINE</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_progress_line" t-on-change="() => { state.config.gantt_show_progress_line = !state.config.gantt_show_progress_line; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">SHOW COLUMN LINES</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_column_lines" t-on-change="() => { state.config.gantt_show_column_lines = !state.config.gantt_show_column_lines; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center mt-2">
                                            <label class="fw-bold text-muted me-auto" style="font-size: 10px;">SHOW ROW LINES</label>
                                            <div class="form-check form-switch m-0">
                                                <input class="form-check-input" type="checkbox" t-att-checked="state.config.gantt_show_row_lines" t-on-change="() => { state.config.gantt_show_row_lines = !state.config.gantt_show_row_lines; this.saveConfig(); }" style="cursor: pointer;"/>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </t>
                        </div>
                    </t>
                </div>

                <div class="o_ug_divider"/>

                <div class="d-flex border rounded bg-white shadow-sm overflow-hidden" style="height: 34px;">
                    <button class="btn btn-light border-0 rounded-0 px-3" t-att-disabled="!state.history.length" t-on-click="this.undo" title="Undo (Ctrl+Z)"><i class="fa fa-undo"/></button>
                    <button class="btn btn-light border-0 rounded-0 border-start px-3" t-att-disabled="!state.redoStack.length" t-on-click="this.redo" title="Redo (Ctrl+Y)"><i class="fa fa-repeat"/></button>
                </div>

                <div class="d-flex border rounded bg-white shadow-sm overflow-hidden" style="height: 34px;">
                    <button class="btn btn-light border-0 rounded-0 px-3" t-on-click="this.shiftPrev"><i class="fa fa-chevron-left"/></button>
                    <button class="btn btn-light border-0 rounded-0 border-start px-3" t-on-click="this.shiftNext"><i class="fa fa-chevron-right"/></button>
                </div>

                <div class="position-relative" t-ref="rangeWrapper">
                    <div class="o_ug_date_range_picker shadow-sm" t-on-click="() => state.rangeOpen = !state.rangeOpen">
                        <i class="fa fa-calendar-o text-muted me-2"/> <t t-esc="this.rangeLabel"/> <i t-attf-class="fa {{ state.rangeOpen ? 'fa-caret-up' : 'fa-caret-down' }} ms-1"/>
                    </div>
                    <t t-if="state.rangeOpen">
                        <div class="o_ug_popover_base o_ug_date_popover shadow-lg">
                            <div class="o_ug_date_item" t-on-click.stop="() => this.applyPreset('today')">Today</div>
                            <div class="o_ug_date_item" t-on-click.stop="() => this.applyPreset('week')">This week</div>
                            <div class="o_ug_date_item" t-on-click.stop="() => this.applyPreset('month')">This month</div>
                            <div class="o_ug_date_item" t-on-click.stop="() => this.applyPreset('quarter')">This quarter</div>
                            <div class="o_ug_date_item" t-on-click.stop="() => this.applyPreset('year')">This year</div>
                            <div class="o_ug_date_custom">
                                <div class="o_ug_date_input_group"><span>FROM</span> <input type="date" class="o_ug_date_field" t-model="state.tempS"/></div>
                                <div class="o_ug_date_input_group"><span>TO</span> <input type="date" class="o_ug_date_field" t-model="state.tempE"/></div>
                                <button class="o_ug_date_apply_btn shadow-sm" t-on-click="this.applyCustomRange">APPLY</button>
                            </div>
                        </div>
                    </t>
                </div>

                <button class="o_ug_btn shadow-sm" t-on-click="this.snapToday" title="Snap to Today"><i class="fa fa-crosshairs text-primary"/></button>
                <div class="o_ug_divider"/>

                <div class="o_ug_zoom_container shadow-sm me-2">
                    <i class="fa fa-search-minus opacity-50 cursor-pointer" t-on-click="this.zoomOut"/>
                    <input type="range" class="o_ug_slider" min="0" max="7" t-model.number="state.zI"/>
                    <i class="fa fa-search-plus opacity-50 cursor-pointer" t-on-click="this.zoomIn"/>
                </div>

                <div class="d-flex gap-1 me-2">
                    <button class="o_ug_btn shadow-sm" t-on-click="this.onAutoSchedule" title="Auto Schedule Project" style="width:36px; padding:0; justify-content:center;"><i class="fa fa-magic text-primary"/></button>
                    <button class="o_ug_btn shadow-sm" t-att-class="{ 'bg-primary text-white': state.versionsOpen }" t-on-click="this.toggleVersions" title="Version History" style="width:36px; padding:0; justify-content:center;"><i class="fa fa-history"/></button>
                    <button class="o_ug_btn shadow-sm" t-on-click="() => state.showSaveVersion = true" title="Save New Version" style="width:36px; padding:0; justify-content:center;"><i class="fa fa-save text-info"/></button>
                </div>

                <div class="o_ug_divider"/>

                <div class="d-flex border rounded bg-white shadow-sm overflow-hidden" style="height: 34px;">
                    <button class="btn btn-light border-0 rounded-0 px-3 fw-bold text-primary" t-on-click="this.setBaseline" style="font-size: 11px;">SET BASELINES</button>
                    <button t-attf-class="btn border-0 rounded-0 border-start px-3 fw-bold {{ state.config.gantt_show_baselines ? 'btn-primary text-white' : 'btn-light text-muted' }}" t-on-click="() => { state.config.gantt_show_baselines = !state.config.gantt_show_baselines; this.saveConfig(); }" style="font-size: 11px;">SHOW BASELINES</button>
                </div>

                <div class="ms-auto d-flex align-items-center gap-2">
                    <div class="o_ug_search_integrated shadow-sm">
                        <i class="fa fa-search text-muted opacity-50" style="font-size: 13px;"/>
                        <input type="text" class="o_ug_search_input_final" placeholder="Search tasks..." t-model="state.taskSearch"/>
                    </div>
                </div>
            </div>

            <div t-attf-class="o_ug_main_flex {{ state.timelineOnly ? 'o_ug_timeline_only' : '' }} {{ state.config.gantt_hide_schedule ? 'o_ug_hide_schedule' : '' }}">
                 <t t-if="state.depDrag">
                    <div class="o_ug_dep_tooltip shadow-lg" t-att-style="'left: '+(state.depDrag.mouseX+25)+'px; top: '+(state.depDrag.mouseY+10)+'px;'">
                        <div class="o_ug_tooltip_label">From</div>
                        <div class="o_ug_tooltip_val"><t t-esc="state.depDrag.source.name"/></div>
                        <div class="o_ug_tooltip_label">To</div>
                        <div class="o_ug_tooltip_val"><t t-esc="state.depDrag.targetName || '...'"/></div>
                    </div>
                 </t>
                  <div class="o_ug_sidebar d-flex flex-column border-end flex-shrink-0 bg-white overflow-hidden" t-attf-style="width: {{ state.config.gantt_hide_schedule ? '100%' : state.sidebarWidth + 'px' }};">
                    <div class="o_ug_sidebar_horizontal">
                        <div class="o_ug_sidebar_scroll_content">
                            <div class="o_ug_header_bar_fixed sticky-top shadow-sm border-bottom">
                             <div class="d-flex flex-column w-100">
                                 <div style="height: 30px; border-bottom: 1px solid #dee2e6; display: flex; align-items: center; padding-left: 24px; font-weight: 800; font-size:11px; color:#64748b;">PLANNING</div>
                                     <div t-att-style="'height: 35px; display: flex;'" class="w-100">
                                         <div t-if="state.config.gantt_show_wbs" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.wbs}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center; border-left: none;">WBS <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'wbs')"></div></div>
                                         <div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.name}}px; font-size: 9px; font-weight: 800; color: #94a3b8; padding-left: 24px;">NAME <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'name')"></div></div>
                                         <div t-if="state.config.gantt_show_cost" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.cost}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">COST <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'cost')"></div></div>
                                         <div t-if="state.config.gantt_show_start_date" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.start}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">START <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'start')"></div></div>
                                         <div t-if="state.config.gantt_show_duration" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.dur}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">DURATION <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'dur')"></div></div>
                                         <div t-if="state.config.gantt_show_assignees" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.res}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">ASSIGNED RESOURCES <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'res')"></div></div>
                                         <div t-if="state.config.gantt_show_progress" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.progress}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">% DONE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'progress')"></div></div>
                                         <div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.pred}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">PREDECESSORS <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'pred')"></div></div>
                                         <div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.succ}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">SUCCESSORS <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'succ')"></div></div>
                                         <div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.mode}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">SCHEDULING <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'mode')"></div></div>
                                         <div t-if="state.config.gantt_show_calendar" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.cal}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">CALENDAR <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'cal')"></div></div>
                                         <div t-if="state.config.gantt_show_constraint_type" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.constr}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">CONSTRAINT TYPE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'constr')"></div></div>
                                         <div t-if="state.config.gantt_show_constraint_date" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.cDate}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">CONSTRAINT DATE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'cDate')"></div></div>
                                         <div t-if="state.config.gantt_show_status" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.status}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">STATUS <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'status')"></div></div>
                                         <div t-if="state.config.gantt_show_complexity" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.complex}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">COMPLEXITY <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'complex')"></div></div>
                                         <div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.deadline}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">DEADLINE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'deadline')"></div></div>
                                         <div t-if="state.config.gantt_show_actual_effort" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.actual_effort}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">ACTUAL EFFORT <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'actual_effort')"></div></div>
                                         <div t-if="state.config.gantt_show_baseline_duration" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.baseline_duration}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">BASELINE DURATION <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'baseline_duration')"></div></div>
                                         <div t-if="state.config.gantt_show_baseline_effort" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.baseline_effort}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">BASELINE EFFORT <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'baseline_effort')"></div></div>
                                         <div t-if="state.config.gantt_show_baseline_finish" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.baseline_finish}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">BASELINE FINISH <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'baseline_finish')"></div></div>
                                         <div t-if="state.config.gantt_show_baseline_start" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.baseline_start}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">BASELINE START <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'baseline_start')"></div></div>
                                         <div t-if="state.config.gantt_show_duration_variance" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.duration_variance}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">DURATION VARIANCE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'duration_variance')"></div></div>
                                         <div t-if="state.config.gantt_show_early_end" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.early_end}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">EARLY END <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'early_end')"></div></div>
                                         <div t-if="state.config.gantt_show_early_start" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.early_start}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">EARLY START <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'early_start')"></div></div>
                                         <div t-if="state.config.gantt_show_effort" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.effort}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">EFFORT <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'effort')"></div></div>
                                         <div t-if="state.config.gantt_show_finish" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.finish}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">FINISH <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'finish')"></div></div>
                                         <div t-if="state.config.gantt_show_finish_variance" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.finish_variance}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">FINISH VARIANCE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'finish_variance')"></div></div>
                                         <div t-if="state.config.gantt_show_ignore_resource_calendar" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.ignore_resource_calendar}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">IGNORE RES. CAL <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'ignore_resource_calendar')"></div></div>
                                         <div t-if="state.config.gantt_show_inactive" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.inactive}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">INACTIVE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'inactive')"></div></div>
                                         <div t-if="state.config.gantt_show_info" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.info}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">INFO <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'info')"></div></div>
                                         <div t-if="state.config.gantt_show_late_end" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.late_end}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">LATE END <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'late_end')"></div></div>
                                         <div t-if="state.config.gantt_show_late_start" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.late_start}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">LATE START <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'late_start')"></div></div>
                                         <div t-if="state.config.gantt_show_manually_scheduled" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.manually_scheduled}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">MANUAL SCHED <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'manually_scheduled')"></div></div>
                                         <div t-if="state.config.gantt_show_milestone" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.milestone}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">MILESTONE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'milestone')"></div></div>
                                         <div t-if="state.config.gantt_show_note" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.note}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">NOTE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'note')"></div></div>
                                         <div t-if="state.config.gantt_show_planned_percent_done" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.planned_percent_done}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">PLANNED % <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'planned_percent_done')"></div></div>
                                         <div t-if="state.config.gantt_show_rollup" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.rollup}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">ROLLUP <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'rollup')"></div></div>
                                         <div t-if="state.config.gantt_show_scheduling_direction" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.scheduling_direction}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">SCHED DIRECTION <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'scheduling_direction')"></div></div>
                                         <div t-if="state.config.gantt_show_show_in_timeline" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.show_in_timeline}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">TIMELINE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'show_in_timeline')"></div></div>
                                         <div t-if="state.config.gantt_show_start_variance" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.start_variance}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">START VARIANCE <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'start_variance')"></div></div>
                                         <div t-if="state.config.gantt_show_total_slack" class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.total_slack}}px; font-size: 9px; font-weight: 800; color: #94a3b8; justify-content: center;">TOTAL SLACK <div class="o_ug_col_resizer" t-on-mousedown="(ev) => this.onColResizeMD(ev, 'total_slack')"></div></div>

                                     </div>
                                 </div>
                            </div>
                        <div class="o_ug_sidebar_sync shadow-none" t-ref="sidebarSync" style="width: max-content; min-width: 100%;">
                        <t t-foreach="this.visibleProjects" t-as="p" t-key="p.id">
                                 <div class="o_ug_row o_ug_project_row" t-att-style="'height: '+state.config.gantt_row_height+'px; width: max-content; min-width: 100%;'" t-on-mouseenter="() => this.onPEnter(p)" t-on-mouseleave="this.onPLeave" t-att-class="{ 'o_ug_row_hover': state.hId === p.id }">
                                     <div t-if="state.config.gantt_show_wbs" class="o_ug_sidebar_col fw-bold text-dark" t-attf-style="width: {{state.colWidths.wbs}}px; justify-content: center;"><t t-esc="p.computed_wbs"/></div>
                                     <div class="o_ug_sidebar_col flex-shrink-0" t-attf-style="width: {{state.colWidths.name}}px; padding-left: 24px;">
                                         <i t-attf-class="fa {{ state.coll['proj_'+p.r_id] ? 'fa-folder text-warning' : 'fa-folder-open text-primary' }} me-2" style="font-size:16px; cursor: pointer;" t-on-click.stop="() => this.toggleColl('proj_'+p.r_id)"/>
                                         <span class="text-uppercase text-truncate"><t t-esc="p.name"/></span>
                                     </div>
                                     <div t-if="state.config.gantt_show_cost" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.cost}}px; justify-content: center;">$<t t-esc="p.cost.toFixed(2)"/></div>
                                     <div t-if="state.config.gantt_show_start_date" class="o_ug_sidebar_col opacity-75 fw-bold" t-attf-style="width: {{state.colWidths.start}}px; justify-content: center;"><t t-esc="p.planned_date_begin.split(' ')[0]"/></div>
                                     <div t-if="state.config.gantt_show_duration" class="o_ug_sidebar_col opacity-75 fw-bold" t-attf-style="width: {{state.colWidths.dur}}px; justify-content: center;"><t t-esc="p.real_duration"/></div>
                                     <div t-if="state.config.gantt_show_assignees" class="o_ug_sidebar_col opacity-50 fw-bold" t-attf-style="width: {{state.colWidths.res}}px;">-</div>
                                     <div t-if="state.config.gantt_show_progress" class="o_ug_sidebar_col opacity-50 fw-bold text-primary" t-attf-style="width: {{state.colWidths.progress}}px;"><t t-esc="Math.round(p.tasks.reduce((acc,t)=>acc+t.actual_progress,0)/Math.max(p.tasks.length,1))"/>%</div>
                                     <div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.pred}}px;">-</div>
                                     <div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.succ}}px;">-</div>
                                     <div class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.mode}}px;">Normal</div>
                                     <div t-if="state.config.gantt_show_calendar" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.cal}}px;">Standard</div>
                                     <div t-if="state.config.gantt_show_constraint_type" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.constr}}px;">-</div>
                                     <div t-if="state.config.gantt_show_constraint_date" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.cDate}}px;">-</div>
                                     <div t-if="state.config.gantt_show_status" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.status}}px;">Active</div>
                                     <div t-if="state.config.gantt_show_complexity" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.complex}}px;"><t t-esc="p.complexity || 'normal'"/></div>
                                     <div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.deadline}}px;"><t t-esc="p.date_deadline ? p.date_deadline.split(' ')[0] : '-'"/></div>
                                     <div t-if="state.config.gantt_show_actual_effort" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.actual_effort}}px;">-</div>
                                     <div t-if="state.config.gantt_show_baseline_duration" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.baseline_duration}}px;">-</div>
                                     <div t-if="state.config.gantt_show_baseline_effort" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.baseline_effort}}px;">-</div>
                                     <div t-if="state.config.gantt_show_baseline_finish" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.baseline_finish}}px;">-</div>
                                     <div t-if="state.config.gantt_show_baseline_start" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.baseline_start}}px;">-</div>
                                     <div t-if="state.config.gantt_show_duration_variance" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.duration_variance}}px;">-</div>
                                     <div t-if="state.config.gantt_show_early_end" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.early_end}}px;">-</div>
                                     <div t-if="state.config.gantt_show_early_start" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.early_start}}px;">-</div>
                                     <div t-if="state.config.gantt_show_effort" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.effort}}px;">-</div>
                                     <div t-if="state.config.gantt_show_finish" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.finish}}px;">-</div>
                                     <div t-if="state.config.gantt_show_finish_variance" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.finish_variance}}px;">-</div>
                                     <div t-if="state.config.gantt_show_ignore_resource_calendar" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.ignore_resource_calendar}}px;">-</div>
                                     <div t-if="state.config.gantt_show_inactive" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.inactive}}px;">-</div>
                                     <div t-if="state.config.gantt_show_info" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.info}}px;">-</div>
                                     <div t-if="state.config.gantt_show_late_end" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.late_end}}px;">-</div>
                                     <div t-if="state.config.gantt_show_late_start" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.late_start}}px;">-</div>
                                     <div t-if="state.config.gantt_show_manually_scheduled" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.manually_scheduled}}px;">-</div>
                                     <div t-if="state.config.gantt_show_milestone" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.milestone}}px;">-</div>
                                     <div t-if="state.config.gantt_show_note" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.note}}px;">-</div>
                                     <div t-if="state.config.gantt_show_planned_percent_done" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.planned_percent_done}}px;">-</div>
                                     <div t-if="state.config.gantt_show_rollup" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.rollup}}px;">-</div>
                                     <div t-if="state.config.gantt_show_scheduling_direction" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.scheduling_direction}}px;">-</div>
                                     <div t-if="state.config.gantt_show_show_in_timeline" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.show_in_timeline}}px;">-</div>
                                     <div t-if="state.config.gantt_show_start_variance" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.start_variance}}px;">-</div>
                                     <div t-if="state.config.gantt_show_total_slack" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.total_slack}}px;">-</div>

                                 </div>
                                 <t t-if="!state.coll['proj_'+p.r_id]">
                            <t t-foreach="p.visibleTasks" t-as="t" t-key="t.id">
                                 <div class="o_ug_row" t-att-style="'height: '+state.config.gantt_row_height+'px; width: max-content; min-width: 100%; ' + (state.editingCell &amp;&amp; state.editingCell.id === t.id ? 'overflow: visible !important; z-index: 999;' : '')" t-on-mouseenter="() => this.onPEnter(t)" t-on-mouseleave="this.onPLeave" t-att-class="{ 'o_ug_row_hover': state.hId === t.id }" t-on-contextmenu.prevent="(ev) => this.onContextMenu(ev, t)">
                                     <div t-if="state.config.gantt_show_wbs" class="o_ug_sidebar_col opacity-50" t-attf-style="width: {{state.colWidths.wbs}}px; justify-content: center;"><t t-esc="t.computed_wbs"/></div>
                                     <div class="o_ug_sidebar_col flex-shrink-0 text-dark" t-attf-style="padding-left: {{ 24 + (t.depth+1)*28 }}px !important; font-weight: 600; width: {{state.colWidths.name}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'name')">
                                         <t t-if="t.children and t.children.length > 0"><i t-attf-class="fa {{ state.coll['task_'+t.id] ? 'fa-plus-square text-primary' : 'fa-minus-square text-muted' }} me-2" style="cursor: pointer;" t-on-click.stop="() => this.toggleColl('task_'+t.id)"/></t>
                                         <t t-else=""><i class="fa fa-minus opacity-25 me-2"/></t>
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'name'">
                                             <input type="text" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <span class="text-truncate"><t t-esc="t.name"/></span>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_cost" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.cost}}px; justify-content: center; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'cost')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'cost'">
                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             $<t t-esc="(t.cost || 0).toFixed(2)"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_start_date" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.start}}px; justify-content: center; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'planned_date_begin')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'planned_date_begin'">
                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.planned_date_begin ? t.planned_date_begin.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_duration" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.dur}}px; justify-content: center;"><t t-esc="t.real_duration"/></div>
                                     <div t-if="state.config.gantt_show_assignees" class="o_ug_sidebar_col opacity-75 fw-bold" t-attf-style="width: {{state.colWidths.res}}px; font-size:10px;">
                                         <t t-if="t.assignees &amp;&amp; t.assignees.length">
                                             <t t-foreach="t.assignees" t-as="user" t-key="user.id">
                                                 <img t-if="user.image_128" t-att-src="'/web/image/res.users/' + user.id + '/image_128'" class="rounded-circle me-1" style="width: 20px; height: 20px;" t-att-title="user.name"/>
                                                 <span t-else="" class="rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center me-1" style="width: 20px; height: 20px; font-size: 8px;"><t t-esc="user.name[0]"/></span>
                                             </t>
                                         </t>
                                         <t t-else="">-</t>
                                     </div>
                                     <div t-if="state.config.gantt_show_progress" class="o_ug_sidebar_col opacity-75 fw-bold text-primary" t-attf-style="width: {{state.colWidths.progress}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'actual_progress')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'actual_progress'">
                                             <input type="number" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="Math.round(t.actual_progress || 0)"/>%
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_predecessors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.pred}}px; position: relative; overflow: visible !important;" t-on-dblclick="() => this.startCellEdit(t, 'depend_on_ids')">
    <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'depend_on_ids'">
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; border: 2px solid #017e84; background: white; z-index: 90;" tabindex="0" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
            <span class="text-truncate px-1 fw-bold text-dark" style="font-size: 11px;"><t t-esc="(state.editingCell.val &amp;&amp; (state.editingCell.val &amp;&amp; state.editingCell.val.length)) ? (state.editingCell.val &amp;&amp; (state.editingCell.val &amp;&amp; state.editingCell.val.length)) + ' tasks' : 'Select...'"/></span>
            <i class="fa fa-caret-down me-1 text-dark"/>
        </div>
        <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="this.commitCellEdit"></div>
        <div class="o_ug_dep_dropdown d-flex flex-column" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1050; border-radius: 4px;">
            <div class="p-2 border-bottom fw-bolder text-muted bg-light" style="font-size: 10px; text-transform: uppercase; border-radius: 4px 4px 0 0;">Predecessors</div>
            <div style="max-height: 200px; overflow-y: auto; padding: 4px;">
                <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                    <label t-if="tt.id !== t.id &amp;&amp; (!t.dependent_ids || !t.dependent_ids.includes(tt.id))" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                        <input type="checkbox" class="form-check-input m-0 flex-shrink-0" t-att-checked="state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id)" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                        <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                    </label>
                </t>
            </div>
            <div class="p-2 border-top text-end bg-light" style="border-radius: 0 0 4px 4px;">
                <button class="btn btn-sm btn-primary w-100" style="font-size: 12px; padding: 4px 10px;" t-on-click.stop.prevent="this.commitCellEdit">Apply Changes</button>
            </div>
        </div>
    </t>
    <t t-else="">
        <t t-esc="t.predecessor_wbs || '-'"/>
    </t>
</div>
                                     <div t-if="state.config.gantt_show_successors" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.succ}}px; position: relative; overflow: visible !important;" t-on-dblclick="() => this.startCellEdit(t, 'dependent_ids')">
    <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'dependent_ids'">
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: space-between; border: 2px solid #017e84; background: white; z-index: 90;" tabindex="0" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
            <span class="text-truncate px-1 fw-bold text-dark" style="font-size: 11px;"><t t-esc="(state.editingCell.val &amp;&amp; (state.editingCell.val &amp;&amp; state.editingCell.val.length)) ? (state.editingCell.val &amp;&amp; (state.editingCell.val &amp;&amp; state.editingCell.val.length)) + ' tasks' : 'Select...'"/></span>
            <i class="fa fa-caret-down me-1 text-dark"/>
        </div>
        <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="this.commitCellEdit"></div>
        <div class="o_ug_dep_dropdown d-flex flex-column" style="position: absolute; top: 100%; left: 0; width: 250px; background: white; border: 1px solid #cbd5e1; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1050; border-radius: 4px;">
            <div class="p-2 border-bottom fw-bolder text-muted bg-light" style="font-size: 10px; text-transform: uppercase; border-radius: 4px 4px 0 0;">Successors</div>
            <div style="max-height: 200px; overflow-y: auto; padding: 4px;">
                <t t-foreach="this.props.model.data.flatMap(p => p.tasks || [])" t-as="tt" t-key="tt.id">
                    <label t-if="tt.id !== t.id &amp;&amp; (!t.depend_on_ids || !t.depend_on_ids.includes(tt.id))" class="d-flex align-items-center p-1 rounded hover-bg-light" style="cursor: pointer; transition: background 0.2s;">
                        <input type="checkbox" class="form-check-input m-0 flex-shrink-0" t-att-checked="state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id)" t-on-change="(ev) => this.toggleDependency(tt.id, ev.target.checked)"/>
                        <span class="ms-2 text-truncate text-dark" style="font-size: 12px;"><t t-esc="tt.name"/> <span class="text-muted">(<t t-esc="tt.wbs_number || tt.id"/>)</span></span>
                    </label>
                </t>
            </div>
            <div class="p-2 border-top text-end bg-light" style="border-radius: 0 0 4px 4px;">
                <button class="btn btn-sm btn-primary w-100" style="font-size: 12px; padding: 4px 10px;" t-on-click.stop.prevent="this.commitCellEdit">Apply Changes</button>
            </div>
        </div>
    </t>
    <t t-else="">
        <t t-esc="t.successor_wbs || '-'"/>
    </t>
</div>
                                     <div class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.mode}}px; position: relative; overflow: visible !important;" t-on-dblclick="() => this.startCellEdit(t, 'scheduling_mode')">
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
                                     </div>
                                      <div t-if="state.config.gantt_show_calendar" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.cal}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'calendar_id')">
                                          <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'calendar_id'">
                                              <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                  <option value="false">Default calendar</option>
                                                  <t t-foreach="this.props.model.allCalendars" t-as="cal" t-key="cal.id">
                                                      <option t-att-value="cal.id"><t t-esc="cal.name"/></option>
                                                  </t>
                                              </select>
                                          </t>
                                          <t t-else="">
                                              <t t-esc="t.calendar_id ? t.calendar_id[1] : 'Default calendar'"/>
                                          </t>
                                      </div>
                                     <div t-if="state.config.gantt_show_constraint_type" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.constr}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'constraint_type')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'constraint_type'">
                                             <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                 <option value="none">None</option>
                                                 <option value="asap">ASAP</option>
                                                 <option value="alap">ALAP</option>
                                                 <option value="mso">Must Start On</option>
                                                 <option value="mfo">Must Finish On</option>
                                                 <option value="snet">Start No Earlier Than</option>
                                                 <option value="snlt">Start No Later Than</option>
                                                 <option value="fnet">Finish No Earlier Than</option>
                                                 <option value="fnlt">Finish No Later Than</option>
                                             </select>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.constraint_type || 'none'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_constraint_date" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.cDate}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'constraint_date')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'constraint_date'">
                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.constraint_date ? t.constraint_date.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_status" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.status}}px;"><t t-esc="t.stage_id ? t.stage_id[1] : 'New'"/></div>
                                     <div t-if="state.config.gantt_show_complexity" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.complex}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'complexity')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'complexity'">
                                             <select class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor">
                                                 <option value="impossible">Impossible</option>
                                                 <option value="hard">Hard</option>
                                                 <option value="normal">Normal</option>
                                                 <option value="easy">Easy</option>
                                             </select>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.complexity || 'normal'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_deadline" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.deadline}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'date_deadline')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'date_deadline'">
                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.date_deadline ? t.date_deadline.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_actual_effort" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.actual_effort}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'actual_effort')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'actual_effort'">
                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.actual_effort || '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_baseline_duration" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.baseline_duration}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'baseline_duration')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'baseline_duration'">
                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.baseline_duration || '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_baseline_effort" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.baseline_effort}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'baseline_effort')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'baseline_effort'">
                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.baseline_effort || '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_baseline_finish" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.baseline_finish}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'baseline_finish')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'baseline_finish'">
                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.baseline_finish ? t.baseline_finish.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_baseline_start" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.baseline_start}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'baseline_start')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'baseline_start'">
                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.baseline_start ? t.baseline_start.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_duration_variance" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.duration_variance}}px;"><t t-esc="t.duration_variance || '-'"/></div>
                                     <div t-if="state.config.gantt_show_early_end" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.early_end}}px;"><t t-esc="t.early_end || '-'"/></div>
                                     <div t-if="state.config.gantt_show_early_start" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.early_start}}px;"><t t-esc="t.early_start || '-'"/></div>
                                     <div t-if="state.config.gantt_show_effort" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.effort}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'effort')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'effort'">
                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.effort || '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_finish" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.finish}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'finish')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'finish'">
                                             <DateTimeInput type="'date'" value="this.getLuxonDate(state.editingCell.val)" onChange="(val) => { state.editingCell.val = val ? val.toFormat('yyyy-MM-dd') : false; this.commitCellEdit(); }"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.finish ? t.finish.split(' ')[0] : '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_finish_variance" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.finish_variance}}px;"><t t-esc="t.finish_variance || '-'"/></div>
                                     <div t-if="state.config.gantt_show_ignore_resource_calendar" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.ignore_resource_calendar}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'ignore_resource_calendar')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'ignore_resource_calendar'">
                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <input type="checkbox" t-att-checked="t.ignore_resource_calendar" disabled="1" style="opacity: 0.8;"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_inactive" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.inactive}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'inactive')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'inactive'">
                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <input type="checkbox" t-att-checked="t.inactive" disabled="1" style="opacity: 0.8;"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_info" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.info}}px;"><t t-esc="t.info || '-'"/></div>
                                     <div t-if="state.config.gantt_show_late_end" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.late_end}}px;"><t t-esc="t.late_end || '-'"/></div>
                                     <div t-if="state.config.gantt_show_late_start" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.late_start}}px;"><t t-esc="t.late_start || '-'"/></div>
                                     <div t-if="state.config.gantt_show_manually_scheduled" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.manually_scheduled}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'manually_scheduled')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'manually_scheduled'">
                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <input type="checkbox" t-att-checked="t.manually_scheduled" disabled="1" style="opacity: 0.8;"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_milestone" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.milestone}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'milestone')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'milestone'">
                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <input type="checkbox" t-att-checked="t.milestone" disabled="1" style="opacity: 0.8;"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_note" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.note}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'note')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'note'">
                                             <input type="text" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.note || '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_planned_percent_done" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.planned_percent_done}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'planned_percent_done')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'planned_percent_done'">
                                             <input type="number" step="0.01" class="o_ug_cell_editor" t-model.number="state.editingCell.val" t-on-blur="this.commitCellEdit" t-on-keydown="(ev) => this.onCellKey(ev)" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <t t-esc="t.planned_percent_done || '-'"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_rollup" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.rollup}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'rollup')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'rollup'">
                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <input type="checkbox" t-att-checked="t.rollup" disabled="1" style="opacity: 0.8;"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_scheduling_direction" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.scheduling_direction}}px; position: relative; overflow: visible !important;" t-on-dblclick="() => this.startCellEdit(t, 'scheduling_direction')">
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
                                     </div>
                                     <div t-if="state.config.gantt_show_show_in_timeline" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.show_in_timeline}}px; position: relative;" t-on-dblclick="() => this.startCellEdit(t, 'show_in_timeline')">
                                         <t t-if="state.editingCell &amp;&amp; state.editingCell.id === t.id &amp;&amp; state.editingCell.field === 'show_in_timeline'">
                                             <input type="checkbox" class="o_ug_cell_editor" t-model="state.editingCell.val" t-on-change="this.commitCellEdit" t-ref="cellEditor"/>
                                         </t>
                                         <t t-else="">
                                             <input type="checkbox" t-att-checked="t.show_in_timeline" disabled="1" style="opacity: 0.8;"/>
                                         </t>
                                     </div>
                                     <div t-if="state.config.gantt_show_start_variance" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.start_variance}}px;"><t t-esc="t.start_variance || '-'"/></div>
                                     <div t-if="state.config.gantt_show_total_slack" class="o_ug_sidebar_col opacity-75" t-attf-style="width: {{state.colWidths.total_slack}}px;"><t t-esc="t.total_slack || '-'"/></div>

                                 </div>
                            </t>
                                 </t>
                        </t>
                        <div class="o_ug_row border-top" style="height: 40px; background: #f8fafc; font-weight: 900; color: #1e293b; width: max-content; min-width: 100%;">
                            <div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.wbs}}px;"/>
                            <div class="o_ug_sidebar_col" t-attf-style="width: {{state.colWidths.name}}px; justify-content: end; padding-right: 24px; text-transform: uppercase; font-size: 11px;">TOTAL</div>
                        </div>
                        </div>
                     </div>
                  </div>
               </div>

                 <div class="o_ug_splitter" t-on-mousedown="this.onSplitterMD">
                    <div class="o_ug_splitter_btn_combined" t-on-click="this.onCombinedSplitterClick">
                        <t t-if="state.config.gantt_hide_schedule or (!state.timelineOnly)">
                            <i class="fa fa-angle-left"/>
                        </t>
                        <t t-if="state.timelineOnly or (!state.config.gantt_hide_schedule)">
                            <i class="fa fa-angle-right"/>
                        </t>
                    </div>
                 </div>

                 <div class="o_ug_timeline_viewport" t-ref="timelineSync" t-on-mouseup="this.onMU">
                    <svg class="o_ug_drag_svg" t-if="state.depDrag">
                        <line t-att-x1="state.depDrag.x1" t-att-y1="state.depDrag.y1" t-att-x2="state.depDrag.x2" t-att-y2="state.depDrag.y2" t-att-stroke="state.depDrag.valid ? '#22c55e' : '#94a3b8'" stroke-width="2.5" stroke-dasharray="5,2" opacity="0.9"/>
                    </svg>

                    <div class="o_ug_header_bar sticky-top shadow-sm" t-att-style="'width: '+this.totalGridWidth+'px;'">
                        <div class="d-flex" style="height: 30px; border-bottom: 1px solid #dee2e6; width: max-content;">
                           <t t-foreach="this.groupedTPts" t-as="g" t-key="'g_'+g.label">
                               <div class="o_ug_ht_label_grouped" t-att-style="'width: '+g.w+'px; flex-shrink: 0;'">
                                   <t t-esc="g.label"/>
                               </div>
                           </t>
                        </div>
                        <div class="o_ug_ht_day_row d-flex" style="width: max-content; min-width: 100%;">
                           <t t-foreach="this.tPts" t-as="tp" t-key="'h_num_'+tp.id">
                               <div t-attf-class="o_ug_ht_day_cell {{ tp.isNow ? 'o_ug_cell_now' : '' }} {{ state.config.gantt_highlight_non_working_time and (tp.unit==='day'||tp.unit==='hour') and (tp.sl === 'SAT' or tp.sl === 'SUN') ? 'o_ug_weekend_header' : '' }}" t-att-style="'flex: 1 0 0%; width: '+tp.w+'px; flex-shrink: 0;'">
                                   <t t-esc="tp.l"/>
                               </div>
                           </t>

                           <t t-if="state.config.gantt_show_project_lines">
                                <t t-foreach="this.visibleProjects" t-as="p" t-key="'marker_'+p.id">
                                    <t t-set="startX" t-value="this.getDateX(p.planned_date_begin)"/>
                                    <t t-set="endX" t-value="this.getDateX(p.date_deadline, true)"/>

                                    <div t-if="startX !== null" class="o_ug_project_marker_line o_ug_project_start_line" t-att-style="'left: '+startX+'px;'">
                                        <div class="o_ug_project_marker_label shadow-sm"><t t-esc="p.name"/>: START</div>
                                    </div>
                                    <div t-if="endX !== null" class="o_ug_project_marker_line o_ug_project_end_line" t-att-style="'left: '+endX+'px;'">
                                        <div class="o_ug_project_marker_label shadow-sm"><t t-esc="p.name"/>: END</div>
                                    </div>
                                </t>
                           </t>
                        </div>
                    </div>
                    <div class="o_ug_timeline_rows position-relative" t-ref="timelineRows" t-att-style="'width: '+this.totalGridWidth+'px; border-right: 1px solid #dee2e6; flex: 1 0 auto;'">
                        <div class="o_ug_grid_layer" t-att-style="'width: '+this.totalGridWidth+'px;'">
                            <t t-foreach="this.tPts" t-as="tp" t-key="'grid_'+tp.id">
                                <div t-attf-class="o_ug_grid_col {{ state.config.gantt_highlight_non_working_time and (tp.unit==='day'||tp.unit==='hour') and (tp.sl === 'SAT' or tp.sl === 'SUN') ? 'o_ug_weekend_col' : '' }}"></div>
                            </t>
                        </div>
                        <div class="o_ug_today_line shadow-sm" t-att-style="'left: '+this.todayX+'px;'"/>

                        <svg class="o_ug_progress_line_svg" t-if="state.config.gantt_show_progress_line" t-att-style="'width: '+this.totalGridWidth+'px; height: '+this.depSvgHeight+'px;'">
                            <path class="o_ug_progress_line_path" t-att-d="this.progressLinePath"/>
                        </svg>

                        <svg class="o_ug_dep_svg" t-att-style="'height: '+this.depSvgHeight+'px; width: '+this.totalGridWidth+'px;'" t-ref="depSvg">
                            <defs>
                                <marker id="ugp-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#94a3b8"/></marker>
                                <marker id="ugp-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#d9534f"/></marker>
                                <marker id="ugp-arrow-inactive" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#cbd5e1"/></marker>
                            </defs>
                            <t t-foreach="this.depLines" t-as="dl" t-key="dl.id"><path t-att-d="dl.path" fill="none" t-att-stroke="dl.isInactive ? '#cbd5e1' : (dl.isCritical ? '#d9534f' : '#94a3b8')" t-att-stroke-dasharray="dl.isInactive ? '4' : '0'" stroke-width="1.2" t-att-marker-end="dl.isInactive ? 'url(#ugp-arrow-inactive)' : (dl.isCritical ? 'url(#ugp-arrow-crit)' : 'url(#ugp-arrow)')"/></t>
                        </svg>

                        <t t-foreach="this.visibleProjects" t-as="p" t-key="'tl_p_'+p.id">
                            <div class="o_ug_row o_ug_project_row" t-att-data-id="'proj_'+p.r_id" t-att-style="'height: '+state.config.gantt_row_height+'px; width: '+this.totalGridWidth+'px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; position: relative;'" t-on-mouseenter="() => this.onPEnter(p)" t-on-mouseleave="this.onPLeave" t-att-class="{ 'o_ug_row_hover': state.hId === p.id }">
                                <t t-set="ps" t-value="this.getStyle(p)"/>
                                <t t-if="state.config.gantt_show_baselines">
                                    <t t-set="bws" t-value="this.getBaselineWrapStyle(p)"/>
                                    <t t-set="bs" t-value="this.getBaselineStyle(p)"/>
                                    <div t-if="bws &amp;&amp; bs" class="ug_baseline_wrap" t-att-style="bws">
                                        <div class="ug_task_baseline" t-att-style="bs + ' height: 3px; margin-bottom: 2px;'"/>
                                        <div class="ug_task_baseline" t-att-style="bs + ' height: 3px; margin-bottom: 2px;'"/>
                                        <div class="ug_task_baseline" t-att-style="bs + ' height: 3px;'"/>
                                    </div>
                                </t>
                                <div t-if="ps" class="o_gantt_pill_wrapper o_ug_project_summary" t-att-style="ps">
                                </div>
                                <span class="ps-2 text-muted" style="font-size:10px; z-index:11; font-weight:bold;"><t t-esc="p.name"/></span>
                            </div>
                            <t t-foreach="p.visibleTasks" t-as="t" t-key="'tl_t_'+t.id">
                                <div class="o_ug_row" t-att-data-id="t.id" t-att-style="'height: '+state.config.gantt_row_height+'px; width: '+this.totalGridWidth+'px; position: relative;'" t-on-mouseenter="() => this.onPEnter(t)" t-on-mouseleave="this.onPLeave" t-att-class="{ 'o_ug_row_hover': state.hId === t.id }" t-on-contextmenu.prevent="(ev) => this.onContextMenu(ev, t)">
                                    <t t-set="ts" t-value="this.getStyle(t)"/>

                                     <div t-if="ts" t-attf-class="o_gantt_pill_wrapper o_draggable {{ t.children &amp;&amp; t.children.length > 0 &amp;&amp; !t.is_milestone ? 'o_ug_summary' : '' }} {{ t.children &amp;&amp; t.children.length > 0 &amp;&amp; !t.is_milestone &amp;&amp; t.isCritical &amp;&amp; state.config.gantt_show_critical_path ? 'o_ug_summary_critical' : '' }}" t-att-style="ts + ' overflow: visible !important;'" t-on-mousedown="(ev)=>this.onBMD(ev,t)" t-on-dblclick="() => this.openTaskEditor(t)">
<t t-if="(!t.children || t.children.length === 0) and !t.is_milestone">
                                            <div t-attf-class="o_gantt_pill {{ t.gantt_color ? 'o_ug_custom_color' : '' }} {{ t.isCritical and state.config.gantt_show_critical_path ? 'o_gantt_pill_critical ripple-danger' : 'o_gantt_pill_tan' }} w-100 h-100 d-flex align-items-center" t-att-style="(t.gantt_color &amp;&amp; !(t.isCritical &amp;&amp; state.config.gantt_show_critical_path) ? '--pill-color:' + t.gantt_color + ' !important; background-color:' + t.gantt_color + ' !important; color: #1e293b !important;' : '') + 'height: '+(state.config.gantt_show_baselines ? Math.floor((state.config.gantt_row_height - 2*state.config.gantt_bar_margin) * 0.45) : (state.config.gantt_row_height - 2*state.config.gantt_bar_margin))+'px !important;'">
                                                 <div t-if="state.config.gantt_enable_dep_draw" class="o_ug_dep_handle o_ug_handle_l" t-on-mousedown.stop="(ev)=>this.onDepStart(ev,t,'l')"/>
                                                 <div t-if="state.depDrag and state.depDrag.targetId === t.id" class="o_ug_dep_handle o_ug_handle_r" style="opacity:1; border-color:#22c55e; transform: translateY(-50%) scale(1.1);"/>
                                                 <div class="o_gantt_progress" t-att-style="'width: '+t.actual_progress+'%;'"/>
                                                 <span t-if="state.config.gantt_show_labels" class="o_gantt_pill_title mx-2"><t t-esc="this.getPillLabel(t)"/></span>
                                                 <div t-if="state.config.gantt_enable_dep_draw" class="o_ug_dep_handle o_ug_handle_r" t-on-mousedown.stop="(ev)=>this.onDepStart(ev,t,'r')"/>
                                             </div>
                                        </t>
                                        <t t-if="t.is_milestone">
                                            <div class="o_ug_milestone_diamond position-relative" t-att-style="'--ug-milestone-color: '+ (t.isCritical &amp;&amp; state.config.gantt_show_critical_path ? '#d9534f' : (t.gantt_color || '#4285F4')) + ';'"></div>
                                            <div t-if="state.config.gantt_enable_dep_draw" class="o_ug_dep_handle o_ug_handle_l" t-on-mousedown.stop="(ev)=>this.onDepStart(ev,t,'l')"/>
                                            <div t-if="state.config.gantt_enable_dep_draw" class="o_ug_dep_handle o_ug_handle_r" t-on-mousedown.stop="(ev)=>this.onDepStart(ev,t,'r')"/>
                                            <span t-if="state.config.gantt_show_labels" class="o_gantt_pill_title ms-2 text-dark fw-bold" style="position: absolute; left: 24px; top: 50%; transform: translateY(-50%); white-space: nowrap; z-index: 10;"><t t-esc="this.getPillLabel(t)"/></span>
                                        </t>
                                      </div>
                                           <t t-if="state.config.gantt_show_baselines and !t.is_milestone">
                                               <t t-set="tbws" t-value="this.getBaselineWrapStyle(t)"/>
                                               <t t-set="tbs1" t-value="this.getBaselineStyle(t)"/>
                                               <t t-set="tbs2" t-value="this.getBaselineStyle2(t)"/>
                                               <t t-set="tbs3" t-value="this.getBaselineStyle3(t)"/>
                                               <t t-if="tbws">
                                                   <div class="ug_baseline_wrap" t-att-style="tbws">
                                                       <t t-if="tbs1"><div class="ug_task_baseline" t-att-style="tbs1"/></t>
                                                       <t t-if="tbs2"><div class="ug_task_baseline" t-att-style="tbs2"/></t>
                                                       <t t-if="tbs3"><div class="ug_task_baseline" t-att-style="tbs3"/></t>
                                                   </div>
                                               </t>
                                           </t>
                                 </div>
                            </t>
                        </t>

                        <div class="o_ug_total_row" t-att-style="'width: '+this.totalGridWidth+'px;'">
                            <t t-foreach="this.tPts" t-as="tp" t-key="'total_bar_'+tp.id">
                                <t t-set="dens" t-value="this.getDensity(tp)"/>
                                <div class="o_ug_total_cell" t-att-style="'width: '+tp.w+'px;'">
                                    <div t-if="dens > 0" class="o_ug_total_bar" t-att-style="'height: '+ Math.min(dens*10, 40) +'px; background: rgba(113, 99, 158, '+ (0.3 + (dens*0.1)) +');'">
                                        <t t-esc="dens"/>
                                    </div>
                                </div>
                            </t>
                        </div>
                    </div>
                </div>

                 <!-- ADVANCED TASK EDITOR MODAL -->
                 <t t-if="state.editorTask">
                    <div class="o_ug_modal_overlay" t-on-click="this.closeEditor">
                        <div class="o_ug_modal" t-on-click.stop="() => { state.openPredDropdownId = null; state.openSuccDropdownId = null; state.openPredTypeDropdownId = null; state.openSuccTypeDropdownId = null; }">
                            <div class="o_ug_modal_header">
                                <h5 class="m-0 fw-bold text-dark"><i class="fa fa-info-circle me-2 text-primary"/> Task Information</h5>
                                <button class="btn-close" t-on-click="this.closeEditor"/>
                            </div>

                            <div class="o_ug_modal_tabs">
                                <div t-attf-class="o_ug_modal_tab {{ state.editorTab === 'general' ? 'active' : '' }}" t-on-click="() => state.editorTab = 'general'">General</div>
                                <div t-attf-class="o_ug_modal_tab {{ state.editorTab === 'predecessors' ? 'active' : '' }}" t-on-click="() => state.editorTab = 'predecessors'">Predecessors</div>
                                <div t-attf-class="o_ug_modal_tab {{ state.editorTab === 'successors' ? 'active' : '' }}" t-on-click="() => state.editorTab = 'successors'">Successors</div>
                                <div t-attf-class="o_ug_modal_tab {{ state.editorTab === 'resources' ? 'active' : '' }}" t-on-click="() => state.editorTab = 'resources'">Resources</div>
                                <div t-attf-class="o_ug_modal_tab {{ state.editorTab === 'advanced' ? 'active' : '' }}" t-on-click="() => state.editorTab = 'advanced'">Advanced</div>
                            </div>

                            <div class="o_ug_modal_body">
                                <t t-if="state.editorTab === 'general'">
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
                                            <t t-if="state.colorDropdownOpen">
                                                <div class="o_ug_dropdown_backdrop" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1040; cursor: default;" t-on-click.stop.prevent="() => state.colorDropdownOpen = false"></div>
                                            </t>
                                            <div class="form-control form-control-sm border-secondary d-flex align-items-center justify-content-between shadow-none" style="border-radius: 6px; cursor: pointer; background: white; z-index: 1045; position: relative;" tabindex="0" t-on-click="() => state.colorDropdownOpen = !state.colorDropdownOpen">
                                                <div class="d-flex align-items-center">
                                                    <div t-if="state.editorTask.gantt_color" t-attf-style="width:18px; height:18px; border-radius:4px; background:{{state.editorTask.gantt_color}}; margin-right: 8px;"></div>
                                                    <div t-else="" style="width:18px; height:18px; border-radius:4px; border: 1px solid #ccc; margin-right: 8px; background: white; position: relative; overflow: hidden;"><div style="position: absolute; width: 140%; height: 1px; background: #ccc; top: 50%; left: -20%; transform: rotate(45deg);"></div></div>
                                                    <span class="text-dark" style="font-size: 13px;"><t t-esc="state.editorTask.gantt_color ? '' : 'No color'"/></span>
                                                </div>
                                                <i class="fa fa-caret-down text-muted"/>
                                            </div>
                                            <div t-if="state.colorDropdownOpen" class="position-absolute bg-white border border-secondary shadow-sm" style="bottom: 100%; margin-bottom: 4px; right: 0; width: 220px; z-index: 1060; border-radius: 8px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
                                                <t t-foreach="['#ef4444','#ec4899','#d946ef','#a855f7','#8b5cf6','#6366f1','#3b82f6','#0ea5e9','#06b6d4','#14b8a6','#10b981','#22c55e','#84cc16','#eab308','#f59e0b','#f97316','#8b4513','#78716c','#57534e','#44403c','#292524','#1c1917','#000000']" t-as="c" t-key="c">
                                                    <div t-attf-style="width: 24px; height: 24px; border-radius: 6px; background: {{c}}; cursor: pointer; border: 2px solid {{state.editorTask.gantt_color === c ? '#000' : 'transparent'}}; box-shadow: 0 1px 2px rgba(0,0,0,0.1); transition: transform 0.1s;"
                                                         t-on-click="() => { state.editorTask.gantt_color = c; state.colorDropdownOpen = false; }"
                                                         onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"/>
                                                </t>
                                                <div style="width: 24px; height: 24px; border-radius: 6px; cursor: pointer; border: 1px solid #ccc; background: white; display: flex; align-items: center; justify-content: center; position: relative;"
                                                     t-on-click="() => { state.editorTask.gantt_color = false; state.colorDropdownOpen = false; }"
                                                     onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                                                     <div style="position: absolute; width: 140%; height: 1px; background: #ccc; transform: rotate(45deg);"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </t>

                                <t t-if="state.editorTab === 'predecessors'">
                                     <div class="d-flex flex-column h-100" style="overflow: visible !important;">
                                         <div class="flex-grow-1" style="max-height: 300px; overflow: visible !important;">
                                              <table class="o_ug_table" style="table-layout: fixed; width: 100%; overflow: visible !important;">
                                                 <thead>
                                                     <tr>
                                                         <th style="width: 320px; padding: 10px;">Name</th>
                                                         <th style="width: 220px; padding: 10px;">Type</th>
                                                         <th style="width: 90px; padding: 10px;">Lag</th>
                                                         <th style="width: 80px; padding: 10px;" class="text-center">Active</th>
                                                         <th style="width: 50px; padding: 10px;"></th>
                                                     </tr>
                                                 </thead>
                                                 <tbody>
                                                     <t t-foreach="state.editorTask._preds" t-as="pId" t-key="pId">
                                                         <t t-set="pT" t-value="this.props.model.allTasksList.find(x=>x.id===pId)"/>
                                                         <tr>
                                                             <td style="overflow: visible !important;">
                                                                  <div class="position-relative w-100 h-100" style="overflow: visible !important;">
                                                                     <div class="d-flex align-items-center justify-content-between px-2 w-100 h-100 cursor-pointer" 
                                                                          style="min-height: 36px;"
                                                                          t-on-click.stop="() => this.togglePredDropdown(pId)">
                                                                          <span class="text-truncate text-dark" style="font-size: 13px;">
                                                                              <t t-esc="pT ? pT.name : 'Select Task'"/>
                                                                              <t t-if="pT">
                                                                                  <t t-if="pT.computed_wbs"> (<t t-esc="pT.computed_wbs"/>)</t>
                                                                              </t>
                                                                          </span>
                                                                          <i class="fa fa-caret-down text-muted ms-1" style="font-size: 11px;"/>
                                                                     </div>
                                                                     <div t-if="state.openPredDropdownId === pId" 
                                                                          class="position-absolute bg-white border rounded shadow-lg py-1 mt-1 w-100 o_ug_custom_dropdown_menu"
                                                                          style="top: 100%; left: 0; z-index: 1050; max-height: 200px; overflow-y: auto;">
                                                                          <t t-foreach="this.props.model.allTasksList" t-as="ot" t-key="ot.id">
                                                                              <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item"
                                                                                   t-att-class="ot.id === pId ? 'active' : ''"
                                                                                   t-on-click.stop="() => this.selectPredecessor(pId, ot.id)">
                                                                                   <t t-esc="ot.name"/>
                                                                                   <t t-if="ot.computed_wbs"> (<t t-esc="ot.computed_wbs"/>)</t>
                                                                              </div>
                                                                          </t>
                                                                     </div>
                                                                 </div>
                                                             </td>
                                                             <td style="overflow: visible !important; padding: 4px 8px !important;">
                                                                  <div class="position-relative w-100 h-100" style="overflow: visible !important;">
                                                                      <div class="d-flex align-items-center justify-content-between px-2 w-100 h-100 cursor-pointer o_ug_type_select shadow-none" 
                                                                           style="min-height: 36px;"
                                                                           t-on-click.stop="() => this.togglePredTypeDropdown(pId)">
                                                                           <span class="text-truncate text-dark" style="font-size: 13px;">
                                                                               <t t-if="this.getPredType(pId) === 'FS'">Finish-to-Start (FS)</t>
                                                                               <t t-elif="this.getPredType(pId) === 'SS'">Start-to-Start (SS)</t>
                                                                               <t t-elif="this.getPredType(pId) === 'FF'">Finish-to-Finish (FF)</t>
                                                                               <t t-elif="this.getPredType(pId) === 'SF'">Start-to-Finish (SF)</t>
                                                                               <t t-else="">Finish-to-Start (FS)</t>
                                                                           </span>
                                                                           <i class="fa fa-caret-down text-muted ms-1" style="font-size: 11px;"/>
                                                                      </div>
                                                                      <div t-if="state.openPredTypeDropdownId === pId" 
                                                                           class="position-absolute bg-white border rounded shadow-lg py-1 mt-1 w-100 o_ug_custom_dropdown_menu"
                                                                           style="top: 100%; left: 0; z-index: 1050; max-height: 200px; overflow-y: auto;">
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getPredType(pId) === 'FS' ? 'active' : ''" t-on-click.stop="() => this.selectPredType(pId, 'FS')">Finish-to-Start (FS)</div>
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getPredType(pId) === 'SS' ? 'active' : ''" t-on-click.stop="() => this.selectPredType(pId, 'SS')">Start-to-Start (SS)</div>
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getPredType(pId) === 'FF' ? 'active' : ''" t-on-click.stop="() => this.selectPredType(pId, 'FF')">Finish-to-Finish (FF)</div>
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getPredType(pId) === 'SF' ? 'active' : ''" t-on-click.stop="() => this.selectPredType(pId, 'SF')">Start-to-Finish (SF)</div>
                                                                      </div>
                                                                  </div>
                                                             </td>
                                                             <td>0d</td>
                                                             <td class="text-center" style="vertical-align: middle;">
                                                                  <input type="checkbox" class="form-check-input mt-0" style="cursor: pointer;"
                                                                         t-att-checked="!state.editorTask._inactive_preds.includes(pId)"
                                                                         t-on-change="(ev) => this.toggleActivePred(pId, ev.target.checked)"/>
                                                              </td>
                                                              <td class="text-center"><i class="fa fa-trash-o text-danger cursor-pointer" t-on-click="() => this.delPred(pId)"/></td>
                                                         </tr>
                                                     </t>
                                                 </tbody>
                                             </table>
                                         </div>
                                         <div class="mt-3">
                                             <button class="btn btn-light btn-sm border fw-bold px-3" t-on-click="this.addPred"><i class="fa fa-plus me-1 text-success"/> ADD PREDECESSOR</button>
                                         </div>
                                     </div>
                                 </t>

                                 <t t-if="state.editorTab === 'successors'">
                                     <div class="d-flex flex-column h-100" style="overflow: visible !important;">
                                         <div class="flex-grow-1 bg-light mb-3" style="max-height: 250px; overflow: visible !important;">
                                              <table class="table table-sm table-borderless table-hover mb-0" style="table-layout: fixed; width: 100%; font-size: 13px; overflow: visible !important;">
                                                 <thead class="bg-white border-bottom" style="position: sticky; top: 0; z-index: 1;">
                                                     <tr>
                                                         <th class="fw-bold text-dark" style="padding: 10px; width: 320px;">Name</th>
                                                         <th class="fw-bold text-dark border-start" style="padding: 10px; width: 220px;">Type</th>
                                                         <th class="fw-bold text-dark text-end border-start" style="padding: 10px; width: 90px;">Lag</th>
                                                         <th class="fw-bold text-dark text-center border-start" style="padding: 10px; width: 80px;">Active</th>
                                                     </tr>
                                                 </thead>
                                                 <tbody>
                                                     <t t-foreach="state.editorTask._succs || []" t-as="sId" t-key="sId">
                                                          <t t-set="s" t-value="this.props.model.allTasksList.find(x=>x.id===sId)"/>
                                                          <tr style="cursor: pointer; background: white;" class="border-bottom" t-attf-class="{{state.selectedSucc === sId ? 'table-primary' : ''}}" t-on-click.stop="() => state.selectedSucc = sId">
                                                              <td class="p-0 border-end" style="vertical-align: middle; overflow: visible !important;">
                                                                  <div class="position-relative w-100 h-100" style="overflow: visible !important;">
                                                                      <div class="d-flex align-items-center justify-content-between px-2 w-100 h-100 cursor-pointer" 
                                                                           style="min-height: 36px;"
                                                                           t-on-click.stop="() => this.toggleSuccDropdown(sId)">
                                                                           <span class="text-truncate text-dark" style="font-size: 13px;">
                                                                               <t t-esc="s ? s.name : 'Select Task'"/>
                                                                               <t t-if="s">
                                                                                   <t t-if="s.computed_wbs"> (<t t-esc="s.computed_wbs"/>)</t>
                                                                               </t>
                                                                           </span>
                                                                           <i class="fa fa-caret-down text-muted ms-1" style="font-size: 11px;"/>
                                                                      </div>
                                                                      <div t-if="state.openSuccDropdownId === sId" 
                                                                           class="position-absolute bg-white border rounded shadow-lg py-1 mt-1 w-100 o_ug_custom_dropdown_menu"
                                                                           style="top: 100%; left: 0; z-index: 1050; max-height: 200px; overflow-y: auto;">
                                                                          <t t-foreach="this.props.model.allTasksList" t-as="ot" t-key="ot.id">
                                                                              <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item"
                                                                                   t-att-class="ot.id === sId ? 'active' : ''"
                                                                                   t-on-click.stop="() => this.selectSuccessor(sId, ot.id)">
                                                                                   <t t-esc="ot.name"/>
                                                                                   <t t-if="ot.computed_wbs"> (<t t-esc="ot.computed_wbs"/>)</t>
                                                                              </div>
                                                                          </t>
                                                                      </div>
                                                                  </div>
                                                              </td>
                                                              <td class="border-end text-center" style="vertical-align: middle; padding: 4px 8px !important; overflow: visible !important;">
                                                                  <div class="position-relative w-100 h-100" style="overflow: visible !important;">
                                                                      <div class="d-flex align-items-center justify-content-between px-2 w-100 h-100 cursor-pointer o_ug_type_select shadow-none" 
                                                                           style="min-height: 36px;"
                                                                           t-on-click.stop="() => this.toggleSuccTypeDropdown(sId)">
                                                                           <span class="text-truncate text-dark" style="font-size: 13px;">
                                                                               <t t-if="this.getSuccType(sId) === 'FS'">Finish-to-Start (FS)</t>
                                                                               <t t-elif="this.getSuccType(sId) === 'SS'">Start-to-Start (SS)</t>
                                                                               <t t-elif="this.getSuccType(sId) === 'FF'">Finish-to-Finish (FF)</t>
                                                                               <t t-elif="this.getSuccType(sId) === 'SF'">Start-to-Finish (SF)</t>
                                                                               <t t-else="">Finish-to-Start (FS)</t>
                                                                           </span>
                                                                           <i class="fa fa-caret-down text-muted ms-1" style="font-size: 11px;"/>
                                                                      </div>
                                                                      <div t-if="state.openSuccTypeDropdownId === sId" 
                                                                           class="position-absolute bg-white border rounded shadow-lg py-1 mt-1 w-100 o_ug_custom_dropdown_menu"
                                                                           style="top: 100%; left: 0; z-index: 1050; max-height: 200px; overflow-y: auto;">
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getSuccType(sId) === 'FS' ? 'active' : ''" t-on-click.stop="() => this.selectSuccType(sId, 'FS')">Finish-to-Start (FS)</div>
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getSuccType(sId) === 'SS' ? 'active' : ''" t-on-click.stop="() => this.selectSuccType(sId, 'SS')">Start-to-Start (SS)</div>
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getSuccType(sId) === 'FF' ? 'active' : ''" t-on-click.stop="() => this.selectSuccType(sId, 'FF')">Finish-to-Finish (FF)</div>
                                                                           <div class="px-3 py-2 cursor-pointer o_ug_custom_dropdown_item" t-att-class="this.getSuccType(sId) === 'SF' ? 'active' : ''" t-on-click.stop="() => this.selectSuccType(sId, 'SF')">Start-to-Finish (SF)</div>
                                                                      </div>
                                                                  </div>
                                                              </td>
                                                              <td class="p-0 border-end text-end" style="vertical-align: middle;">
                                                                  <input type="text" class="form-control form-control-sm border-0 shadow-none text-dark bg-transparent w-100 h-100 text-end pe-2" value="0 days" style="border-radius: 0; min-height: 36px;"/>
                                                              </td>
                                                              <td class="p-0 text-center" style="vertical-align: middle;">
                                                                  <input type="checkbox" class="form-check-input mt-0" style="cursor: pointer;"
                                                                         t-att-checked="!state.editorTask._inactive_succs.includes(sId)"
                                                                         t-on-change="(ev) => this.toggleActiveSucc(sId, ev.target.checked)"/>
                                                              </td>
                                                          </tr>
                                                     </t>
                                                     <tr t-if="!state.editorTask._succs || state.editorTask._succs.length === 0">
                                                         <td colspan="4" class="text-center text-muted py-4 bg-white border-bottom">No successors defined</td>
                                                     </tr>
                                                 </tbody>
                                             </table>
                                         </div>
                                         <div class="d-flex align-items-center gap-3 mt-1 ps-2">
                                              <i class="fa fa-plus fs-5 fw-bold text-dark cursor-pointer" t-on-click="this.addSucc"/>
                                              <i class="fa fa-trash fs-5 cursor-pointer" t-attf-style="color: {{state.selectedSucc ? '#5d4037' : '#ccc'}};" t-on-click="() => state.selectedSucc &amp;&amp; this.delSucc(state.selectedSucc)"/>
                                         </div>
                                     </div>
                                 </t>
                                 <t t-if="state.editorTab === 'resources'">
                                    <div class="d-flex flex-column h-100">
                                        <div class="flex-grow-1" style="max-height: 300px; overflow: visible !important;">
                                             <table class="o_ug_table" style="overflow: visible !important;">
                                                <thead><tr><th>Resource</th><th>Units (%)</th><th style="width:50px;"></th></tr></thead>
                                                <tbody>
                                                    <t t-foreach="state.editorTask._resources" t-as="rId" t-key="rId">
                                                        <t t-set="rU" t-value="this.props.model.allUsers.find(x=>x.id===rId)"/>
                                                        <tr>
                                                            <td class="d-flex align-items-center gap-2">
                                                                <img t-if="rU and rU.image_128" t-attf-src="data:image/png;base64,{{rU.image_128}}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;"/>
                                                                <select class="form-select form-select-sm border-0 bg-transparent" t-on-change="(ev) => this.updateResource(rId, ev.target.value)">
                                                                    <t t-foreach="this.props.model.allUsers" t-as="ou" t-key="ou.id">
                                                                        <option t-att-value="ou.id" t-att-selected="ou.id === rId"><t t-esc="ou.name"/></option>
                                                                    </t>
                                                                </select>
                                                            </td>
                                                            <td>100</td>
                                                            <td class="text-center"><i class="fa fa-trash-o text-danger cursor-pointer" t-on-click="() => this.delRes(rId)"/></td>
                                                        </tr>
                                                    </t>
                                                </tbody>
                                            </table>
                                        </div>
                                        <div class="mt-3">
                                            <button class="btn btn-light btn-sm border fw-bold px-3" t-on-click="this.addRes"><i class="fa fa-plus me-1 text-primary"/> ADD RESOURCE</button>
                                        </div>
                                    </div>
                                </t>

                                 <t t-if="state.editorTab === 'advanced'">
                                     <div class="row g-4 py-2 px-1">
                                         <!-- Left Column (Inputs & Dropdowns) -->
                                         <div class="col-7 border-end pe-4" style="border-color: #f0f0f0 !important;">
                                             <!-- Calendar -->
                                             <div class="row align-items-center mb-3">
                                                 <label class="col-4 text-dark fw-normal" style="font-size: 13px;">Calendar</label>
                                                 <div class="col-8">
                                                     <select class="form-select form-select-sm border py-2 px-3 bg-white" t-model="state.editorTask.calendar_id" style="border-radius: 6px; font-size: 13px; min-height: 38px;">
                                                         <option value="false">Default calendar</option>
                                                         <t t-foreach="this.props.model.allCalendars" t-as="cal" t-key="cal.id">
                                                             <option t-att-value="cal.id"><t t-esc="cal.name"/></option>
                                                         </t>
                                                     </select>
                                                 </div>
                                             </div>

                                             <!-- Scheduling Mode -->
                                             <div class="row align-items-center mb-3">
                                                 <label class="col-4 text-dark fw-normal" style="font-size: 13px;">Scheduling mode</label>
                                                 <div class="col-8">
                                                     <select class="form-select form-select-sm border py-2 px-3 bg-white" t-model="state.editorTask.scheduling_mode" style="border-radius: 6px; font-size: 13px; min-height: 38px;">
                                                         <option value="normal">Normal</option>
                                                         <option value="fixed_units">Fixed Units</option>
                                                         <option value="fixed_duration">Fixed Duration</option>
                                                         <option value="fixed_effort">Fixed Effort</option>
                                                     </select>
                                                 </div>
                                             </div>

                                             <!-- Constraint Divider -->
                                             <div class="d-flex align-items-center my-4">
                                                 <div class="flex-grow-1 border-bottom" style="border-color: #e0e0e0 !important; height: 1px;"></div>
                                                 <span class="mx-3 text-muted fw-bold" style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase;">Constraint</span>
                                                 <div class="flex-grow-1 border-bottom" style="border-color: #e0e0e0 !important; height: 1px;"></div>
                                             </div>

                                             <!-- Constraint Type -->
                                             <div class="row align-items-center mb-3">
                                                 <label class="col-4 text-dark fw-normal" style="font-size: 13px;">Constraint type</label>
                                                 <div class="col-8">
                                                     <select class="form-select form-select-sm border py-2 px-3 bg-white" t-model="state.editorTask.constraint_type" style="border-radius: 6px; font-size: 13px; min-height: 38px;">
                                                         <option value="none">None</option>
                                                         <option value="asap">As soon as possible</option>
                                                         <option value="alap">As late as possible</option>
                                                         <option value="mso">Must start on</option>
                                                         <option value="mfo">Must finish on</option>
                                                         <option value="snet">Start no earlier than</option>
                                                         <option value="snlt">Start no later than</option>
                                                         <option value="fnet">Finish no earlier than</option>
                                                         <option value="fnlt">Finish no later than</option>
                                                     </select>
                                                 </div>
                                             </div>

                                             <!-- Constraint Date -->
                                             <div class="row align-items-center mb-3">
                                                 <label class="col-4 text-dark fw-normal" style="font-size: 13px;">Constraint date</label>
                                                 <div class="col-8">
                                                     <input type="datetime-local" class="form-control form-control-sm border py-2 px-3 bg-white" t-model="state.editorTask.constraint_date" t-att-disabled="state.editorTask.constraint_type === 'none' || state.editorTask.constraint_type === 'asap' || state.editorTask.constraint_type === 'alap'" style="border-radius: 6px; font-size: 13px; min-height: 38px;"/>
                                                 </div>
                                             </div>

                                             <!-- Project Border -->
                                             <div class="row align-items-center mb-3">
                                                 <label class="col-4 text-dark fw-normal" style="font-size: 13px;">Project border</label>
                                                 <div class="col-8">
                                                     <select class="form-select form-select-sm border py-2 px-3 bg-white" t-model="state.editorTask.project_border" style="border-radius: 6px; font-size: 13px; min-height: 38px;">
                                                         <option value="ask">Ask user</option>
                                                         <option value="ignore">Ignore</option>
                                                         <option value="honor">Honor</option>
                                                     </select>
                                                 </div>
                                             </div>
                                         </div>

                                         <!-- Right Column (Switches & Toggles) -->
                                         <div class="col-5 ps-4">
                                             <!-- Ignore Resource Calendar -->
                                             <div class="d-flex align-items-center justify-content-between mb-4 mt-2">
                                                 <label class="text-dark fw-normal" style="font-size: 13px; max-width: 70%; line-height: 1.2;">Ignore resource calendar</label>
                                                 <div class="form-check form-switch p-0 m-0">
                                                     <input class="form-check-input ms-0" type="checkbox" t-model="state.editorTask.ignore_resource_calendar" style="cursor: pointer; width: 40px; height: 20px;"/>
                                                 </div>
                                             </div>

                                             <!-- Effort Driven -->
                                             <div class="d-flex align-items-center justify-content-between mb-4">
                                                 <label class="text-dark fw-normal" style="font-size: 13px;">Effort driven</label>
                                                 <div class="form-check form-switch p-0 m-0">
                                                     <input class="form-check-input ms-0" type="checkbox" t-model="state.editorTask.effort_driven" style="cursor: pointer; width: 40px; height: 20px;"/>
                                                 </div>
                                             </div>

                                             <!-- Alignment Spacer -->
                                             <div style="height: 52px;"></div>

                                             <!-- Rollup -->
                                             <div class="d-flex align-items-center justify-content-between mb-4">
                                                 <label class="text-dark fw-normal" style="font-size: 13px;">Rollup</label>
                                                 <div class="form-check form-switch p-0 m-0">
                                                     <input class="form-check-input ms-0" type="checkbox" t-model="state.editorTask.rollup" style="cursor: pointer; width: 40px; height: 20px;"/>
                                                 </div>
                                             </div>

                                             <!-- Inactive -->
                                             <div class="d-flex align-items-center justify-content-between mb-4">
                                                 <label class="text-dark fw-normal" style="font-size: 13px;">Inactive</label>
                                                 <div class="form-check form-switch p-0 m-0">
                                                     <input class="form-check-input ms-0" type="checkbox" t-model="state.editorTask.inactive" style="cursor: pointer; width: 40px; height: 20px;"/>
                                                 </div>
                                             </div>

                                             <!-- Manually Scheduled -->
                                             <div class="d-flex align-items-center justify-content-between mb-4">
                                                 <label class="text-dark fw-normal" style="font-size: 13px;">Manually scheduled</label>
                                                 <div class="form-check form-switch p-0 m-0">
                                                     <input class="form-check-input ms-0" type="checkbox" t-model="state.editorTask.manually_scheduled" style="cursor: pointer; width: 40px; height: 20px;"/>
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 </t>
                            </div>

                            <div class="o_ug_modal_footer">
                                <button class="btn btn-outline-danger me-auto fw-bold px-4" t-on-click="() => this.deleteTask(state.editorTask.id)">Delete</button>
                                <button class="btn btn-light px-4 fw-bold border" t-on-click="this.closeEditor">Cancel</button>
                                <button class="btn btn-primary px-4 fw-bold shadow-sm" t-on-click="this.saveEditor">Save Changes</button>
                            </div>
                        </div>
                    </div>
                 </t>
             </div>

             <!-- CONTEXT MENU -->
             <div t-if="state.contextMenu" class="o_ug_context_menu" t-att-style="'left: '+state.contextMenu.x+'px; top: '+state.contextMenu.y+'px;'">
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxEdit"><i class="fa fa-pencil fa-fw text-muted"/> Edit</div>
                 <div class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxCopy"><i class="fa fa-copy fa-fw text-muted"/> Copy</div>
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxCut"><i class="fa fa-scissors fa-fw text-muted"/> Cut</div>
                 <div t-attf-class="o_ug_context_menu_item {{ !state.clipboard ? 'disabled' : '' }}" t-on-click.stop="this.ctxPaste"><i class="fa fa-clipboard fa-fw text-muted"/> Paste</div>
                 <div class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxConvertToMilestone"><i class="fa fa-diamond fa-fw text-muted"/> Convert to milestone</div>
                 <div class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxIndent"><i class="fa fa-indent fa-fw text-muted"/> Indent</div>
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxOutdent"><i class="fa fa-outdent fa-fw text-muted"/> Outdent</div>
                 <div class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item" t-on-click.stop="this.ctxDelete"><i class="fa fa-trash fa-fw text-danger"/> <span class="text-danger">Delete</span></div>
                 <div class="o_ug_context_menu_divider"/>
                 <div t-if="state.contextMenu.isTimelinePill" class="o_ug_context_menu_item" t-on-click.stop="this.ctxSplit"><i class="fa fa-code-fork fa-fw text-muted"/> Split</div>
                 <div t-if="state.contextMenu.isTimelinePill" class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item o_ug_has_submenu">
                     <div style="display:flex; align-items:center; gap:6px;">
                         <i class="fa fa-paint-brush fa-fw text-muted"/>
                         Task color
                         <t t-if="state.contextMenu.t.gantt_color">
                             <span t-att-style="'display:inline-block; width:10px; height:10px; border-radius:50%; background:'+state.contextMenu.t.gantt_color+'; border:1px solid rgba(0,0,0,0.2);'"/>
                         </t>
                     </div>
                     <i class="fa fa-caret-right float-end mt-1 text-muted"/>
                     <div class="o_ug_color_submenu">
                         <t t-foreach="['#ef5350', '#ffa726', '#ffee58', '#d4e157', '#66bb6a', '#26a69a', '#26c6da', '#29b6f6', '#42a5f5', '#5c6bc0', '#7e57c2', '#ab47bc', '#ec407a', '#8d6e63', '#bdbdbd']" t-as="clr" t-key="clr">
                             <div t-attf-class="o_ug_color_swatch {{ state.contextMenu.t.gantt_color === clr ? 'o_ug_color_selected' : '' }}"
                                  t-att-style="'background:' + clr + ';'"
                                  t-on-click.stop="() => this.ctxColor(clr)"
                                  t-att-title="clr"/>
                         </t>
                         <div class="o_ug_color_divider"/>
                         <div class="o_ug_color_swatch o_ug_color_none"
                              t-att-class="!state.contextMenu.t.gantt_color ? 'o_ug_color_selected' : ''"
                              t-on-click.stop="() => this.ctxColor(false)"
                              title="No color"/>
                     </div>
                 </div>
                 <div class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item o_ug_has_submenu">
                     <div><i class="fa fa-filter fa-fw text-muted"/> Filter</div><i class="fa fa-caret-right float-end mt-1 text-muted"/>
                     <div class="o_ug_context_submenu" style="bottom: -200px; top: auto; max-height: 350px; overflow-y: auto; overflow-x: hidden;">
                         <div class="o_ug_context_menu_item text-danger" t-on-click.stop="() => this.ctxFilter('Clear')"><span class="ps-3 fw-bold">Clear filter</span></div>
                         <div class="o_ug_context_menu_divider"/>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Empty')"><span class="ps-3">Empty</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Not empty')"><span class="ps-3">Not empty</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Equals')"><span class="ps-3">Equals</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Does not equal')"><span class="ps-3">Does not equal</span></div>
                         <div class="o_ug_context_menu_divider"/>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Time equals')"><span class="ps-3">Time equals</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Time does not equal')"><span class="ps-3">Time does not equal</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Before')"><span class="ps-3">Before</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('After')"><span class="ps-3">After</span></div>
                         <div class="o_ug_context_menu_divider"/>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Today')"><span class="ps-3">Today</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Tomorrow')"><span class="ps-3">Tomorrow</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Yesterday')"><span class="ps-3">Yesterday</span></div>
                         <div class="o_ug_context_menu_divider"/>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('This week')"><span class="ps-3">This week</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Next week')"><span class="ps-3">Next week</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Last week')"><span class="ps-3">Last week</span></div>
                         <div class="o_ug_context_menu_divider"/>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('This month')"><span class="ps-3">This month</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Next month')"><span class="ps-3">Next month</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Last month')"><span class="ps-3">Last month</span></div>
                         <div class="o_ug_context_menu_divider"/>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('This year')"><span class="ps-3">This year</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Next year')"><span class="ps-3">Next year</span></div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxFilter('Last year')"><span class="ps-3">Last year</span></div>
                     </div>
                 </div>
                 <div class="o_ug_context_menu_divider"/>
                 <div class="o_ug_context_menu_item o_ug_has_submenu">
                     <div><i class="fa fa-plus fa-fw text-muted"/> Add... </div><i class="fa fa-caret-right float-end mt-1 text-muted"/>
                     <div class="o_ug_context_submenu">
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxAdd('above')"><i class="fa fa-arrow-up fa-fw text-muted"/> Task above</div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxAdd('below')"><i class="fa fa-arrow-down fa-fw text-muted"/> Task below</div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxAdd('milestone')"><i class="fa fa-diamond fa-fw text-muted"/> Milestone</div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxAdd('subtask')"><i class="fa fa-level-down fa-fw text-muted"/> Subtask</div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxAdd('successor')"><i class="fa fa-link fa-fw text-muted"/> Successor</div>
                         <div class="o_ug_context_menu_item" t-on-click.stop="() => this.ctxAdd('predecessor')"><i class="fa fa-link fa-fw text-muted"/> Predecessor</div>
                     </div>
                 </div>
             </div>

             <!-- TOOLTIP -->
             <div t-if="state.hoverTask" class="o_ug_tooltip" t-att-style="'left: '+state.mouseX+'px; top: '+state.mouseY+'px;'">
                <div class="o_ug_tooltip_header"><t t-esc="state.hoverTask.name"/></div>
                <div class="o_ug_tooltip_row">
                    <span class="o_ug_tooltip_label">Start:</span>
                    <span class="o_ug_tooltip_val"><t t-esc="state.hoverTask.planned_date_begin.split(' ')[0]"/></span>
                </div>
                <div class="o_ug_tooltip_row">
                    <span class="o_ug_tooltip_label">End:</span>
                    <span class="o_ug_tooltip_val"><t t-esc="state.hoverTask.date_deadline.split(' ')[0]"/></span>
                </div>
                <div class="o_ug_tooltip_row">
                    <span class="o_ug_tooltip_label">Duration:</span>
                    <span class="o_ug_tooltip_val"><t t-esc="state.hoverTask.real_duration"/></span>
                </div>
                <div class="o_ug_tooltip_row" t-if="state.hoverTask.baseline_start_date">
                    <span class="o_ug_tooltip_label">Baseline:</span>
                    <span class="o_ug_tooltip_val"><t t-esc="state.hoverTask.baseline_start_date.split(' ')[0]"/></span>
                </div>
                <div class="o_ug_tooltip_row">
                    <span class="o_ug_tooltip_label">Complete:</span>
                    <span class="o_ug_tooltip_val"><t t-esc="Math.round(state.hoverTask.actual_progress || 0)"/>%</span>
                </div>
             </div>
        </div>
    `;

    setup() {
        this.tlRef = useRef("timelineSync"); this.sbRef = useRef("sidebarSync");
        this.timelineRows = useRef("timelineRows"); this.rangeWrapper = useRef("rangeWrapper");
        this.settingsWrapper = useRef("settingsWrapper"); this.cellEditor = useRef("cellEditor");
        this.orm = useService("orm"); this.action = useService("action");
        const now = DateTime.now();
        this.state = useState({
            coll: {}, hId: null, drag: null, depDrag: null, rangeOpen: false, settingsOpen: false, uiSettingsOpen: false, taskSearch: "",
            tS: now.startOf('day'), tE: now.endOf('day'), tempS: now.startOf('day').toISODate(), tempE: now.endOf('day').toISODate(),
            zI: 5, dragOffset: 0, dragChainIds: [], editorTask: null, versionsOpen: false, versions: [], showSaveVersion: false, newVersionName: "", activeVersionId: null,
            history: [], redoStack: [], hoverTask: null, mouseX: 0, mouseY: 0,
            sidebarWidth: parseInt(localStorage.getItem("ugp_sb_w") || "450"), timelineOnly: false, viewportWidth: 0,
            editingCell: null,
            colResize: null,
            colWidths: {
                wbs: 40, name: 250, cost: 80, start: 90, dur: 70, res: 100, progress: 60,
                pred: 80, succ: 80, mode: 90, cal: 100, constr: 120, cDate: 100,
                status: 80, complex: 80, deadline: 90, bStart: 90, bEnd: 90, bDur: 70, type: 60,
                actual_effort: 80, baseline_duration: 100, baseline_effort: 100, baseline_finish: 100, baseline_start: 100, duration_variance: 100, early_end: 80, early_start: 80, effort: 80, finish: 80, finish_variance: 100, ignore_resource_calendar: 80, inactive: 60, info: 60, late_end: 80, late_start: 80, manually_scheduled: 80, milestone: 60, note: 150, planned_percent_done: 80, rollup: 60, scheduling_direction: 100, show_in_timeline: 60, start_variance: 100, total_slack: 80,
                ...JSON.parse(localStorage.getItem("ugp_col_ws") || "{}")
            },
            config: { gantt_row_height: 52, gantt_bar_margin: 8, gantt_show_labels: true, gantt_show_critical_path: false, gantt_show_project_lines: false, gantt_highlight_non_working_time: false, gantt_show_column_lines: true, gantt_show_row_lines: true, gantt_enable_dep_draw: false, gantt_hide_schedule: false, gantt_col_w: 120, gantt_enable_cell_editing: true, gantt_show_progress_line: false, gantt_dependency_type: 'FS', ...JSON.parse(localStorage.getItem("ugp_config") || "{}") }
        });

        onWillStart(async () => {
            const backendConfig = await this.orm.call("res.config.settings", "get_gantt_config", []);
            Object.assign(this.state.config, backendConfig);
        });
        const onGlobalClick = (ev) => {
            if (this.state.rangeOpen && this.rangeWrapper.el && !this.rangeWrapper.el.contains(ev.target)) this.state.rangeOpen = false;
            if (this.state.settingsOpen && this.settingsWrapper.el && !this.settingsWrapper.el.contains(ev.target)) this.state.settingsOpen = false;
            if (this.state.contextMenu && !ev.target.closest('.o_ug_context_menu')) this.state.contextMenu = null;
        };
        const onGlobalMouseMove = (ev) => {
            if (this.state.colResize) this.onColResizeMM(ev);
        };
        const onGlobalMouseUp = () => {
            if (this.state.colResize) this.onColResizeMU();
        };
        onMounted(() => {
            window.addEventListener("mousedown", onGlobalClick, true);
            window.addEventListener("mousemove", onGlobalMouseMove);
            window.addEventListener("mouseup", onGlobalMouseUp);
            if (this.tlRef.el) {
                this.state.viewportWidth = this.tlRef.el.offsetWidth;
                this.resizeObs = new ResizeObserver(() => {
                    if (this.tlRef.el) this.state.viewportWidth = this.tlRef.el.offsetWidth;
                });
                this.resizeObs.observe(this.tlRef.el);
            }
        });
        onWillUnmount(() => {
            window.removeEventListener("mousedown", onGlobalClick, true);
            window.removeEventListener("mousemove", onGlobalMouseMove);
            window.removeEventListener("mouseup", onGlobalMouseUp);
            if (this.resizeObs) this.resizeObs.disconnect();
        });
        useEffect(() => {
            const s = this.sbRef.el, t = this.tlRef.el; if (!s || !t) return;
            const scrollS = (ev) => { if (!this.state.config.gantt_hide_schedule && !this.state.timelineOnly) s.scrollTop = t.scrollTop; };
            const scrollT = (ev) => { if (!this.state.config.gantt_hide_schedule && !this.state.timelineOnly) t.scrollTop = s.scrollTop; };
            t.addEventListener("scroll", scrollS, { passive: true }); s.addEventListener("scroll", scrollT, { passive: true });
            return () => { t.removeEventListener("scroll", scrollS); s.removeEventListener("scroll", scrollT); };
        }, () => [this.sbRef.el, this.tlRef.el, this.state.config.gantt_hide_schedule, this.state.timelineOnly]);
    }
    saveConfig() {
        localStorage.setItem("ugp_config", JSON.stringify(this.state.config));
        localStorage.setItem("ugp_sb_w", this.state.sidebarWidth.toString());
        localStorage.setItem("ugp_col_ws", JSON.stringify(this.state.colWidths));
    }
    onColResizeMD(ev, col) {
        ev.stopPropagation();
        this.state.colResize = { col, startX: ev.clientX, startW: this.state.colWidths[col] };
    }
    onColResizeMM(ev) {
        if (!this.state.colResize) return;
        const dx = ev.clientX - this.state.colResize.startX;
        this.state.colWidths[this.state.colResize.col] = Math.max(40, this.state.colResize.startW + dx);
    }
    onColResizeMU() {
        this.state.colResize = null;
        this.saveConfig();
    }
    onSplitterMD(ev) {
        ev.preventDefault(); const sX = ev.clientX; const sW = this.state.sidebarWidth;
        const onMM = (e) => { this.state.sidebarWidth = Math.max(150, sW + (e.clientX - sX)); };
        const onMU = () => { window.removeEventListener("mousemove", onMM); window.removeEventListener("mouseup", onMU); this.saveConfig(); };
        window.addEventListener("mousemove", onMM); window.addEventListener("mouseup", onMU);
    }
    startCellEdit(task, field) {
        if (!this.state.config.gantt_enable_cell_editing) return;
        if (task.id.toString().startsWith('proj_')) return;
        let val = task[field];
        if (field === 'calendar_id') val = val ? (Array.isArray(val) ? val[0] : val) : false;
        if (field.includes('date')) val = (val || '').split(' ')[0];
        if (field === 'depend_on_ids' || field === 'dependent_ids') val = Array.isArray(val) ? [...val] : [];
        this.state.editingCell = { id: task.id, field, val, original: task[field] };
        setTimeout(() => { if (this.cellEditor.el) this.cellEditor.el.focus(); }, 50);
    }
    onCellKey(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); this.commitCellEdit(); }
        else if (ev.key === 'Escape') { this.state.editingCell = null; }
    }

    hasCycle(taskId, targetIds, isSuccessorEdit = false) {
        const graph = {};
        this.props.model.data.forEach(p => p.tasks.forEach(t => {
            if (t) graph[t.id] = t.depend_on_ids || [];
        }));
        
        if (isSuccessorEdit) {
            // If editing successors of taskId, it means targetIds now depend on taskId
            targetIds.forEach(targetId => {
                if (!graph[targetId]) graph[targetId] = [];
                if (!graph[targetId].includes(taskId)) graph[targetId] = [...graph[targetId], taskId];
            });
            // We also need to remove taskId from tasks that were previously successors but aren't anymore, 
            // but for cycle detection, over-approximating (leaving old ones) is safe and stricter.
        } else {
            // Editing predecessors
            graph[taskId] = targetIds;
        }
        
        const visited = new Set();
        const recStack = new Set();
        
        const dfs = (node) => {
            if (recStack.has(node)) return true;
            if (visited.has(node)) return false;
            
            visited.add(node);
            recStack.add(node);
            
            const deps = graph[node] || [];
            for (let i = 0; i < deps.length; i++) {
                if (dfs(deps[i])) return true;
            }
            
            recStack.delete(node);
            return false;
        };
        
        for (let node in graph) {
            if (dfs(Number(node))) return true;
        }
        return false;
    }
    async commitCellEdit() {
        if (!this.state.editingCell) return;
        const { id, field, val, original } = this.state.editingCell;
        this.state.editingCell = null;
        if (val == original) return;

        let finalVal = val;

        let writeVals = {};
        if (field === 'depend_on_ids' || field === 'dependent_ids') {
            const arr = Array.isArray(val) ? val.map(Number) : [];
            const isSuccessor = field === 'dependent_ids';
            if (this.hasCycle(id, arr, isSuccessor)) {
                this.env.services.notification.add("Invalid Dependency: This action creates a circular dependency.", { type: "danger" });
                return;
            }
            writeVals[field] = [[6, 0, arr]];
        } else if (field.includes('date')) {
            if (!val) finalVal = original;
            else finalVal = serializeDateTime(DateTime.fromISO(val));
            writeVals[field] = finalVal;

            const t = this.props.model.data.flatMap(p => p.tasks || []).find(x => x && x.id === id);
            if (t) {
                let sStr = field === 'planned_date_begin' ? finalVal : t.planned_date_begin;
                let eStr = field === 'date_deadline' ? finalVal : t.date_deadline;
                writeVals['is_milestone'] = (sStr === eStr);
            }
        } else if (['cost', 'actual_progress', 'effort'].includes(field)) {
            finalVal = parseFloat(val) || 0;
            writeVals[field] = finalVal;
        } else if (field === 'calendar_id') {
            finalVal = (val === 'false' || !val) ? false : parseInt(val, 10);
            writeVals[field] = finalVal;
        } else {
            writeVals[field] = finalVal;
        }

        this.pushHistory('update', { id, [field]: original }, { id, ...writeVals });
        await this.orm.write("project.task", [id], writeVals);
        this.props.model.load(this.props.model.params);
    }
    toggleTimelineOnly() {
        this.state.timelineOnly = !this.state.timelineOnly;
        if (this.state.timelineOnly) this.state.config.gantt_hide_schedule = false;
        this.saveConfig();
    }
    toggleHideSchedule() {
        this.state.config.gantt_hide_schedule = !this.state.config.gantt_hide_schedule;
        if (this.state.config.gantt_hide_schedule) this.state.timelineOnly = false;
        this.saveConfig();
    }
    async setBaseline() {
        if (!confirm("Are you sure you want to recalculate and set baselines for all tasks in this view?")) return;
        const taskIds = this.props.model.allTasksList.map(t => t.id);
        const pIds = (this.props.model.data || []).map(p => p.r_id);
        
        if (pIds.length > 0) {
            await this.orm.call("project.project", "action_set_baseline", [pIds]);
        }
        if (taskIds.length > 0) {
            await this.orm.call("project.task", "action_set_baseline", [taskIds]);
        }
        
        await this.props.model.load(this.props.model.params);
    }
    onCombinedSplitterClick(ev) {
        const rect = ev.currentTarget.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        if (x < rect.width / 2) { // Clicked Left Arrow -> Collapse Grid (Move Splitter Left)
            if (this.state.config.gantt_hide_schedule) {
                this.state.config.gantt_hide_schedule = false;
            } else {
                this.state.timelineOnly = !this.state.timelineOnly;
            }
        } else { // Clicked Right Arrow -> Collapse Timeline (Move Splitter Right)
            if (this.state.timelineOnly) {
                this.state.timelineOnly = false;
            } else {
                this.state.config.gantt_hide_schedule = !this.state.config.gantt_hide_schedule;
            }
        }
        this.saveConfig();
    }
    onBarMarginInput(ev) { this.state.config.gantt_bar_margin = 25 - parseInt(ev.target.value); this.saveConfig(); }
    getPillLabel(t) {
        const s = deserializeDateTime(t.planned_date_begin), e = deserializeDateTime(t.date_deadline);
        return `${s.toFormat("MM/dd")} - ${e.toFormat("MM/dd")} - ${t.name}`;
    }
    getDensity(tp) {
        let count = 0; const tpsS = this.state.tS.plus({ days: this.tPts.indexOf(tp) }).startOf('day'); const tpsE = tpsS.endOf('day');
        if (SCALES[this.state.zI].unit === 'hour') {
            let hIndex = this.tPts.indexOf(tp);
            let hStart = this.state.tS.plus({ hours: hIndex });
            let hEnd = hStart.plus({ hours: 1 });
            (this.props.model.data || []).forEach(p => p.tasks.forEach(t => {
                let ts = deserializeDateTime(t.planned_date_begin), te = deserializeDateTime(t.date_deadline);
                if (ts < hEnd && te > hStart) count++;
            }));
            return count;
        }
        (this.props.model.data || []).forEach(p => p.tasks.forEach(t => {
            let ts = deserializeDateTime(t.planned_date_begin), te = deserializeDateTime(t.date_deadline);
            if (ts < tpsE && te > tpsS) count++;
        }));
        return count;
    }
    async openTask(id) { await this.action.doAction({ type: "ir.actions.act_window", res_model: "project.task", res_id: id, view_mode: "form", target: "new", on_close: () => this.props.model.load(this.props.model.params) }); }
    get rangeLabel() {
        const d = Math.round(this.state.tE.diff(this.state.tS, 'days').days);
        if (d > 350) return this.state.tS.toFormat("yyyy");
        if (d === 6) { const mid = this.state.tS.plus({ days: 3 }); return `W${mid.toFormat("WW")} ${mid.toFormat("yyyy")}`; }
        return this.state.tS.toFormat("MM/dd/yyyy") + (this.state.tS.hasSame(this.state.tE, 'day') ? '' : " — " + this.state.tE.toFormat("MM/dd/yyyy"));
    }
    shiftPrev() { const d = this.state.tE.diff(this.state.tS).as('milliseconds') + 1; this.state.tS = this.state.tS.minus(d); this.state.tE = this.state.tE.minus(d); this.state.tempS = this.state.tS.toISODate(); this.state.tempE = this.state.tE.toISODate(); }
    shiftNext() { const d = this.state.tE.diff(this.state.tS).as('milliseconds') + 1; this.state.tS = this.state.tS.plus(d); this.state.tE = this.state.tE.plus(d); this.state.tempS = this.state.tS.toISODate(); this.state.tempE = this.state.tE.toISODate(); }
    snapToday() { this.applyPreset('today'); }
    applyPreset(p) {
        const n = DateTime.now();
        if (p === 'today') { this.state.tS = n.startOf('day'); this.state.tE = n.endOf('day'); this.state.zI = 5; }
        else if (p === 'week') {
            this.state.tS = n.startOf('week').minus({ days: 1 }); // Start on Sunday
            this.state.tE = this.state.tS.plus({ days: 6 }).endOf('day');
            this.state.zI = 4;
        }
        else if (p === 'month') { this.state.tS = n.startOf('month'); this.state.tE = n.endOf('month'); this.state.zI = 4; }
        else if (p === 'quarter') { this.state.tS = n.startOf('quarter'); this.state.tE = n.endOf('quarter'); this.state.zI = 3; }
        else { this.state.tS = n.startOf('year'); this.state.tE = n.endOf('year'); this.state.zI = 2; }

        this.state.tempS = this.state.tS.toISODate();
        this.state.tempE = this.state.tE.toISODate();
        this.state.rangeOpen = false;

        // Use a longer timeout and explicit refresh to ensure re-render happens first
        setTimeout(() => {
            if (this.tlRef.el) {
                const tx = this.todayX;
                const center = this.tlRef.el.offsetWidth / 2;
                this.tlRef.el.scrollTo({ left: Math.max(0, tx - center), behavior: 'smooth' });
            }
        }, 150);
    }
    applyCustomRange() {
        this.state.tS = DateTime.fromISO(this.state.tempS).startOf('day');
        this.state.tE = DateTime.fromISO(this.state.tempE).endOf('day');
        if (this.state.tS.hasSame(this.state.tE, 'day')) this.state.zI = 5; else this.state.zI = 4;
        this.state.rangeOpen = false;
    }
    zoomIn() { if (this.state.zI < SCALES.length - 1) this.state.zI++; }
    zoomOut() { if (this.state.zI > 0) this.state.zI--; }
    get sidebarWidth() { return 80 + 250 + 120 + 130 + 150; }
    toggleColl(id) { this.state.coll[id] = !this.state.coll[id]; }
    expandAll() { this.state.coll = {}; }
    collapseAll() { this.state.coll = {}; (this.props.model.data || []).forEach(p => { this.state.coll['proj_' + p.r_id] = true; p.tasks.forEach(t => this.state.coll['task_' + t.id] = true); }); }
    get todayX() { return this.getDateX(DateTime.now()); }
    getDateX(date, isEnd = false) {
        if (!date) return null;
        let dt; try { dt = typeof date === 'string' ? DateTime.fromISO(date.split(' ')[0]) : date; if (isEnd) dt = dt.endOf('day'); } catch (e) { return null; }
        if (!dt || !dt.isValid) return null;

        const container = this.timelineRows.el;
        if (!container) return dt.diff(this.state.tS).as('days') * this.currentPx;

        const totalW = container.offsetWidth;
        const totalDays = this.state.tE.diff(this.state.tS).as('days');
        return (dt.diff(this.state.tS).as('days') / totalDays) * totalW;
    }
    get currentPx() {
        const u = SCALES[this.state.zI].unit;
        let px = SCALES[this.state.zI].px;
        const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days));

        if (this.state.zI === 2 || dDiff > 350) return (this.totalGridWidthRaw) / 365.25;
        if (u === 'day' && dDiff <= 7) px = 180;
        if (u === 'hour') px = 1200 / 24;

        // Auto-stretch to fill screen
        const vw = this.state.viewportWidth;
        if (vw > 0) {
            const dCount = (u === 'hour') ? 1 : (dDiff + 1);
            const totalW = dCount * (u === 'hour' ? 24 * px : px);
            if (totalW < vw) {
                return (u === 'hour') ? (vw / 24) : (vw / dCount);
            }
        }
        return px;
    }
    get totalGridWidthRaw() { return this.tPtsRaw.reduce((acc, p) => acc + p.w, 0); }
    get tPtsRaw() {
        const u = SCALES[this.state.zI].unit, st = this.state.tS;
        let pts = [];
        for (let i = 0; i < 12; i++) {
            let m = st.startOf('year').plus({ months: i });
            pts.push({ w: 150 });
        }
        return pts;
    }
    get totalGridWidth() { return Math.max(this.state.viewportWidth || 0, this.tPts.reduce((acc, p) => acc + p.w, 0)); }
    get tPts() {
        const u = SCALES[this.state.zI].unit, st = this.state.tS, en = this.state.tE, now = DateTime.now();
        let pts = [];
        const px = this.currentPx;
        if (this.state.zI === 2 || Math.round(en.diff(st, 'days').days) > 350) {
            for (let i = 0; i < 12; i++) {
                let m = st.startOf('year').plus({ months: i });
                pts.push({ id: 'm_' + i, unit: 'month', l: m.toFormat("LLLL"), sl_top: m.toFormat("yyyy"), w: px });
            }
        } else if (u === 'hour') {
            for (let i = 0; i < 24; i++) {
                let h = st.plus({ hours: i });
                pts.push({ id: 'h_' + i, unit: 'hour', l: h.toFormat("HH"), sl_top: h.toFormat("d LLLL yyyy"), w: px, sl: h.toFormat("ccc").toUpperCase(), isNow: now.hasSame(h, 'hour') && now.hasSame(h, 'day') });
            }
        } else {
            const diffDays = Math.abs(Math.round(en.diff(st, 'days').days));
            let dCount = diffDays + 1;
            const mid = st.plus({ days: Math.floor(diffDays / 2) });
            const weekLabel = `W${mid.toFormat("WW")} ${mid.toFormat("yyyy")}`;
            for (let i = 0; i < dCount; i++) {
                let p = { id: u + '_' + i, unit: u }, ct = st.plus({ days: i });
                if (ct > en && i > 0) break;
                if (u === 'year') { p.l = ct.toFormat("yyyy"); p.sl_top = "Yearly"; p.w = px * 365; }
                else if (u === 'month') { p.l = ct.toFormat("MMMM"); p.sl_top = ct.toFormat("yyyy"); p.w = px * 30; }
                else if (u === 'week') { p.l = "W" + ct.toFormat("WW"); p.sl_top = ct.toFormat("LLLL yyyy"); p.w = px * 7; }
                else {
                    p.l = ct.toFormat("dd"); p.sl = ct.toFormat("ccc").toUpperCase();
                    p.sl_top = (diffDays <= 7) ? weekLabel : ct.toFormat("LLLL yyyy");
                    p.w = px; p.isNow = now.hasSame(ct, 'day');
                }
                pts.push(p);
            }
        } return pts;
    }
    get groupedTPts() {
        const pts = this.tPts; if (!pts.length) return [];
        let groups = []; let current = { label: pts[0].sl_top, pts: [pts[0]], w: pts[0].w };
        for (let i = 1; i < pts.length; i++) {
            if (pts[i].sl_top === current.label) { current.pts.push(pts[i]); current.w += pts[i].w; }
            else { groups.push(current); current = { label: pts[i].sl_top, pts: [pts[i]], w: pts[i].w }; }
        }
        groups.push(current); return groups;
    }
    get visibleProjects() {
        const s = this.state.taskSearch.toLowerCase();
        const cf = this.state.customFilter;
        return (this.props.model.data || []).map(p => {
            let v = []; 
            if (!this.state.coll['proj_' + p.r_id] && p.tasks) { 
                let sD = -1; 
                for (let t of p.tasks) { 
                    if (sD !== -1 && t.depth > sD) continue; 
                    sD = -1; 
                    let keep = true;
                    if (s && !t.name.toLowerCase().includes(s)) keep = false;
                    
                    if (keep && cf) {
                        let fval = (t.name || '').toLowerCase();
                        let dval = (t.planned_date_begin || '').split(' ')[0];
                        let cval = (cf.value || '').toLowerCase();
                        let isDate = cf.op.includes('Time') || cf.op === 'Before' || cf.op === 'After' || cf.op === 'Today' || cf.op === 'Tomorrow' || cf.op === 'Yesterday' || cf.op.includes('week') || cf.op.includes('month') || cf.op.includes('year');
                        let target = isDate ? dval : fval;
                        
                        if (cf.op === 'Equals') keep = target === cval;
                        else if (cf.op === 'Does not equal') keep = target !== cval;
                        else if (cf.op === 'Empty') keep = target === '';
                        else if (cf.op === 'Not empty') keep = target !== '';
                        else if (cf.op === 'Time equals') keep = dval === cval;
                        else if (cf.op === 'Time does not equal') keep = dval !== cval;
                        else if (cf.op === 'Before') keep = dval < cval;
                        else if (cf.op === 'After') keep = dval > cval;
                        else if (cf.op === 'Today' || cf.op === 'Tomorrow' || cf.op === 'Yesterday' || cf.op.includes('week') || cf.op.includes('month') || cf.op.includes('year')) {
                             // Basic fallback for complex date filters
                             keep = dval !== '';
                        }
                    }
                    
                    if (keep) { 
                        v.push(t); 
                        if (this.state.coll['task_' + t.id]) sD = t.depth; 
                    } 
                } 
            }
            return { ...p, visibleTasks: v };
        }).filter(p => !s || p.visibleTasks.length > 0 || p.name.toLowerCase().includes(s));
    }
    getStyle(t) {
        let px = SCALES[this.state.zI].px; const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days));
        if (this.state.zI === 2 || dDiff > 350) px = (this.totalGridWidth) / 365.25;
        else if (SCALES[this.state.zI].unit === 'day' && dDiff <= 7) px = 180;
        let sStr = t.planned_date_begin || t.date_start;
        let eStr = t.date_deadline || t.date;
        if (!sStr || !eStr) return null;
        let s = deserializeDateTime(sStr), e = deserializeDateTime(eStr);
        if (!s || !e) return null;
        const sId = String(t.id);
        if (this.state.drag && (String(this.state.drag.t.id) === sId || this.state.dragChainIds.includes(sId))) {
            const dx = this.state.dragOffset || 0;
            s = s.plus({ days: dx }); e = e.plus({ days: dx });
        }
        let l = (s.diff(this.state.tS).as('days')) * px, w = (e.diff(s).as('days')) * px;
        if (t.is_milestone) return `left:${l - 9}px; width:18px;`;
        return `left:${l}px; width:${Math.max(w, 5)}px;`;
    }
    
    getBaselineWrapStyle(t) {
        let sStr = t.baseline_start_date;
        if (!sStr || sStr === 'False') sStr = t.planned_date_begin || t.date_start;
        let eStr = t.baseline_end_date;
        if (!eStr || eStr === 'False') eStr = t.date_deadline || t.date;
        
        if (!sStr || !eStr) return null;
        
        let rowH = this.state.config.gantt_row_height || 52;
        let margin = this.state.config.gantt_bar_margin || 8;
        let isSummary = (t.r_id || (t.children && t.children.length > 0 && !t.is_milestone));
        
        let bHeight = 8;
        let topOffset = rowH - margin - bHeight + 4; // Anchor to the very bottom
        
        if (isSummary) {
            topOffset = (rowH / 2) + 6;
            bHeight = 4; // thinner for summary
        }
        
        return `display: flex; flex-direction: column; position: absolute; top: ${topOffset}px; left: 0px; height: ${bHeight}px; width: 100%; z-index: 9999; pointer-events: none;`;
    }
    
    getBaselineStyle(t) {
        let sStr = t.baseline_start_date;
        if (!sStr || sStr === 'False') sStr = t.planned_date_begin || t.date_start;
        let eStr = t.baseline_end_date;
        if (!eStr || eStr === 'False') eStr = t.date_deadline || t.date;
        
        if (!sStr || !eStr) return null;
        let px = SCALES[this.state.zI].px; const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days));
        if (this.state.zI === 2 || dDiff > 350) px = (this.totalGridWidth) / 365.25; else if (SCALES[this.state.zI].unit === 'day' && dDiff <= 7) px = 180;
        let s = deserializeDateTime(sStr), e = deserializeDateTime(eStr);
        if (!s || !e) return null;
        let l = (s.diff(this.state.tS).as('days')) * px, w = (e.diff(s).as('days')) * px;
        
        return `left:${l}px; width:${Math.max(w, 5)}px; background: #b8c2cc; position: absolute; top: 0px; height: 2px; border-radius: 3px; box-sizing: border-box; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05); z-index: 10;`;
    }

    getBaselineStyle2(t) {
        let sStr = t.baseline2_start_date;
        if (!sStr || sStr === 'False') sStr = t.planned_date_begin || t.date_start;
        let eStr = t.baseline2_end_date;
        if (!eStr || eStr === 'False') eStr = t.date_deadline || t.date;
        
        if (!sStr || !eStr) return null;
        let px = SCALES[this.state.zI].px; const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days));
        if (this.state.zI === 2 || dDiff > 350) px = (this.totalGridWidth) / 365.25; else if (SCALES[this.state.zI].unit === 'day' && dDiff <= 7) px = 180;
        let s = deserializeDateTime(sStr), e = deserializeDateTime(eStr);
        if (!s || !e) return null;
        let l = (s.diff(this.state.tS).as('days')) * px, w = (e.diff(s).as('days')) * px;
        
        return `left:${l}px; width:${Math.max(w, 5)}px; background: #b8c2cc; position: absolute; top: 3px; height: 2px; border-radius: 3px; box-sizing: border-box; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05); z-index: 10;`;
    }

    getBaselineStyle3(t) {
        let sStr = t.baseline3_start_date;
        if (!sStr || sStr === 'False') sStr = t.planned_date_begin || t.date_start;
        let eStr = t.baseline3_end_date;
        if (!eStr || eStr === 'False') eStr = t.date_deadline || t.date;
        
        if (!sStr || !eStr) return null;
        let px = SCALES[this.state.zI].px; const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days));
        if (this.state.zI === 2 || dDiff > 350) px = (this.totalGridWidth) / 365.25; else if (SCALES[this.state.zI].unit === 'day' && dDiff <= 7) px = 180;
        let s = deserializeDateTime(sStr), e = deserializeDateTime(eStr);
        if (!s || !e) return null;
        let l = (s.diff(this.state.tS).as('days')) * px, w = (e.diff(s).as('days')) * px;
        
        return `left:${l}px; width:${Math.max(w, 5)}px; background: #b8c2cc; position: absolute; top: 6px; height: 2px; border-radius: 3px; box-sizing: border-box; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05); z-index: 10;`;
    }

    getLuxonDate(dateStr) {
        if (!dateStr) return false;
        return luxon.DateTime.fromSQL(dateStr.split(' ')[0]);
    }

    toggleDependency(id, checked) {
        if (!this.state.editingCell || !Array.isArray(this.state.editingCell.val)) return;
        if (checked) {
            if (!this.state.editingCell.val.includes(id)) this.state.editingCell.val.push(id);
        } else {
            this.state.editingCell.val = this.state.editingCell.val.filter(x => x !== id);
        }
    }
    async openTaskEditor(t) {
        this.state.editorTab = 'general';
        const successors = this.getTaskSuccessors(t.id) || [];
        this.state.openPredDropdownId = null;
        this.state.openSuccDropdownId = null;
        this.state.openPredTypeDropdownId = null;
        this.state.openSuccTypeDropdownId = null;
        this.state.selectedSucc = null;

        // Fetch predecessor dependency records to extract types and lags
        const deps = await this.orm.searchRead("project.task.dependency", [["task_id", "=", t.id]], ["depends_on_id", "dependency_type", "lag"]);
        const depTypes = {};
        deps.forEach(d => {
            const predId = Array.isArray(d.depends_on_id) ? d.depends_on_id[0] : d.depends_on_id;
            depTypes[predId] = (d.dependency_type || 'fs').toUpperCase();
        });

        // Fetch successor dependency records to extract types and lags
        const succDeps = await this.orm.searchRead("project.task.dependency", [["depends_on_id", "=", t.id]], ["task_id", "dependency_type", "lag"]);
        const succDepTypes = {};
        succDeps.forEach(d => {
            const succId = Array.isArray(d.task_id) ? d.task_id[0] : d.task_id;
            succDepTypes[succId] = (d.dependency_type || 'fs').toUpperCase();
        });

        this.state.editorTask = {
            ...t,
            planned_date_begin: t.planned_date_begin.replace(' ', 'T').substring(0, 16),
            date_deadline: t.date_deadline.replace(' ', 'T').substring(0, 16),
            constraint_date: t.constraint_date ? t.constraint_date.replace(' ', 'T').substring(0, 16) : null,
            calendar_id: t.calendar_id ? (Array.isArray(t.calendar_id) ? t.calendar_id[0] : t.calendar_id) : false,
            _preds: [...(t.depend_on_ids || [])],
            _inactive_preds: [...(t.inactive_dependency_ids || [])],
            _resources: [...(t.user_ids || [])],
            _succs: successors.map(s => s.id),
            _inactive_succs: successors.filter(s => (s.inactive_dependency_ids || []).includes(t.id)).map(s => s.id),
            _depTypes: depTypes,
            _succDepTypes: succDepTypes
        };
    }
    getPredType(pId) {
        return (this.state.editorTask && this.state.editorTask._depTypes && this.state.editorTask._depTypes[pId]) || 'FS';
    }
    getSuccType(sId) {
        return (this.state.editorTask && this.state.editorTask._succDepTypes && this.state.editorTask._succDepTypes[sId]) || 'FS';
    }
    togglePredTypeDropdown(pId) {
        this.state.openPredTypeDropdownId = this.state.openPredTypeDropdownId === pId ? null : pId;
        this.state.openSuccTypeDropdownId = null;
        this.state.openPredDropdownId = null;
        this.state.openSuccDropdownId = null;
    }
    selectPredType(pId, type) {
        if (!this.state.editorTask._depTypes) this.state.editorTask._depTypes = {};
        this.state.editorTask._depTypes[pId] = type;
        this.state.openPredTypeDropdownId = null;
    }
    toggleSuccTypeDropdown(sId) {
        this.state.openSuccTypeDropdownId = this.state.openSuccTypeDropdownId === sId ? null : sId;
        this.state.openPredTypeDropdownId = null;
        this.state.openPredDropdownId = null;
        this.state.openSuccDropdownId = null;
    }
    selectSuccType(sId, type) {
        if (!this.state.editorTask._succDepTypes) this.state.editorTask._succDepTypes = {};
        this.state.editorTask._succDepTypes[sId] = type;
        this.state.openSuccTypeDropdownId = null;
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
    }
    togglePredDropdown(pId) {
        this.state.openPredDropdownId = this.state.openPredDropdownId === pId ? null : pId;
        this.state.openSuccDropdownId = null;
    }
    toggleSuccDropdown(sId) {
        this.state.openSuccDropdownId = this.state.openSuccDropdownId === sId ? null : sId;
        this.state.openPredDropdownId = null;
    }
    selectPredecessor(oldId, newId) {
        const idx = this.state.editorTask._preds.indexOf(oldId);
        if (idx !== -1) {
            this.state.editorTask._preds[idx] = parseInt(newId);
        }
        this.state.openPredDropdownId = null;
    }
    selectSuccessor(oldId, newId) {
        const idx = this.state.editorTask._succs.indexOf(oldId);
        if (idx !== -1) {
            this.state.editorTask._succs[idx] = parseInt(newId);
        }
        this.state.openSuccDropdownId = null;
    }
    addSucc() {
        const first = this.props.model.allTasksList.find(t => t.id !== this.state.editorTask.id && !(this.state.editorTask._succs || []).includes(t.id));
        if (first) {
            if (!this.state.editorTask._succs) this.state.editorTask._succs = [];
            this.state.editorTask._succs.push(first.id);
        }
    }
    delSucc(id) {
        this.state.editorTask._succs = (this.state.editorTask._succs || []).filter(s => s !== id);
    }
    closeEditor() { this.state.editorTask = null; }
    async saveEditor() {
        const et = this.state.editorTask;
        const original = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === et.id) || {};

        // Normalize calendar_id — handles all OWL binding formats:
        //   string "2" (from select), number 2, array [2,"name"] (from task data), false/null/""
        const toCalId = v => {
            if (!v || v === 'false') return false;
            if (Array.isArray(v)) return v[0] || false;
            if (typeof v === 'number') return v;
            return parseInt(v, 10) || false;
        };
        const calId    = toCalId(et.calendar_id);
        const oldCalId = toCalId(original.calendar_id);

        // --- Calendar-aware date recalculation ---
        const allCals = this.props.model.allCalendars || [];
        const DEFAULT_HOURS = 8;
        let sStr = et.planned_date_begin.replace('T', ' ') + ':00';
        let eStr = et.date_deadline.replace('T', ' ') + ':00';

        if (calId !== oldCalId) {
            try {
                // 1. Calculate EXACT working hours under the OLD calendar
                let workingHours = 0;
                if (oldCalId) {
                    workingHours = await this.orm.call("resource.calendar", "get_work_hours_count", [[oldCalId], sStr, eStr]);
                } else {
                    // Fallback: 24/7 default calendar
                    const startMs = new Date(sStr.replace(' ', 'T') + 'Z').getTime();
                    const endMs   = new Date(eStr.replace(' ', 'T') + 'Z').getTime();
                    workingHours = (endMs - startMs) / 3600000;
                }

                // 2. Schedule those exact working hours on the NEW calendar intervals
                if (calId && workingHours > 0) {
                    // plan_hours(hours, day_dt)
                    const newEndDt = await this.orm.call("resource.calendar", "plan_hours", [[calId], workingHours, sStr]);
                    if (newEndDt && typeof newEndDt === 'string') {
                        eStr = newEndDt; // Odoo returns string "YYYY-MM-DD HH:MM:SS"
                    }
                } else if (!calId && workingHours > 0) {
                    // Fallback: map working hours straight to 24/7 clock
                    const startMs = new Date(sStr.replace(' ', 'T') + 'Z').getTime();
                    const newEnd = new Date(startMs + workingHours * 3600000);
                    const pad = n => String(n).padStart(2, '0');
                    eStr = `${newEnd.getUTCFullYear()}-${pad(newEnd.getUTCMonth()+1)}-${pad(newEnd.getUTCDate())} ${pad(newEnd.getUTCHours())}:${pad(newEnd.getUTCMinutes())}:00`;
                }
            } catch (err) {
                console.warn("Calendar recalculation via ORM failed, falling back to math:", err);
                const allCals = this.props.model.allCalendars || [];
                const oldCalObj = oldCalId ? allCals.find(c => c.id === oldCalId) : null;
                const newCalObj = calId ? allCals.find(c => c.id === calId) : null;
                const oldHpd = (oldCalObj && oldCalObj.hours_per_day) ? oldCalObj.hours_per_day : 8;
                const newHpd = (newCalObj && newCalObj.hours_per_day) ? newCalObj.hours_per_day : 8;
                if (oldHpd > 0 && newHpd > 0) {
                    const startMs = new Date(sStr.replace(' ', 'T') + 'Z').getTime();
                    const endMs   = new Date(eStr.replace(' ', 'T') + 'Z').getTime();
                    const calendarDays = (endMs - startMs) / (24 * 3600000);
                    const newEnd = new Date(startMs + (calendarDays * oldHpd / newHpd) * 24 * 3600000);
                    const pad = n => String(n).padStart(2, '0');
                    eStr = `${newEnd.getUTCFullYear()}-${pad(newEnd.getUTCMonth()+1)}-${pad(newEnd.getUTCDate())} ${pad(newEnd.getUTCHours())}:${pad(newEnd.getUTCMinutes())}:00`;
                }
            }
        }

        // Build base vals — do NOT include sequence here:
        // Writing sequence triggers Odoo's _resequence which shuffles siblings by date.
        const vals = {
            name: et.name,
            planned_date_begin: sStr,
            date_deadline: eStr,
            is_milestone: sStr === eStr,
            actual_progress: et.actual_progress,
            cost: et.cost,
            complexity: et.complexity,
            gantt_color: et.gantt_color,
            effort: et.effort,
            scheduling_mode: et.scheduling_mode,
            constraint_type: et.constraint_type,
            constraint_date: et.constraint_date ? et.constraint_date.replace('T', ' ') + ':00' : false,
            manually_scheduled: et.manually_scheduled,
            rollup: et.rollup,
            inactive: et.inactive,
            calendar_id: calId,
            ignore_resource_calendar: et.ignore_resource_calendar,
            effort_driven: et.effort_driven,
            project_border: et.project_border,
        };

        // Only write relation fields if they actually changed — prevents Odoo
        // from resequencing sibling tasks when only the calendar changes.
        const origPreds = [...(original.depend_on_ids || [])].sort().join(',');
        const newPreds  = [...(et._preds || [])].sort().join(',');
        if (origPreds !== newPreds) {
            vals.depend_on_ids = [[6, 0, et._preds]];
        }

        const origInactive = [...(original.inactive_dependency_ids || [])].sort().join(',');
        const newInactive  = [...(et._inactive_preds || [])].sort().join(',');
        if (origInactive !== newInactive) {
            vals.inactive_dependency_ids = [[6, 0, et._inactive_preds]];
        }

        const origResources = [...(original.user_ids || [])].sort().join(',');
        const newResources  = [...(et._resources || [])].sort().join(',');
        if (origResources !== newResources) {
            vals.user_ids = [[6, 0, et._resources]];
        }

        this.pushHistory('update', { id: et.id, ...original }, { id: et.id, ...vals });
        await this.orm.write("project.task", [et.id], vals);

        // Handle successor updates:
        const originalSuccIds = this.getTaskSuccessors(et.id).map(s => s.id);
        const currentSuccIds = et._succs || [];

        // 1. Remove depend_on_ids from removed successors
        const removedSuccs = originalSuccIds.filter(id => !currentSuccIds.includes(id));
        for (let sId of removedSuccs) {
            const taskObj = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === sId);
            if (taskObj) {
                let preds = (taskObj.depend_on_ids || []).filter(id => id !== et.id);
                let inactivePreds = (taskObj.inactive_dependency_ids || []).filter(id => id !== et.id);
                await this.orm.write("project.task", [sId], {
                    depend_on_ids: [[6, 0, preds]],
                    inactive_dependency_ids: [[6, 0, inactivePreds]]
                });
            }
        }

        // 2. Add depend_on_ids to new successors
        const newSuccs = currentSuccIds.filter(id => !originalSuccIds.includes(id));
        for (let sId of newSuccs) {
            const taskObj = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === sId);
            if (taskObj) {
                let preds = [...(taskObj.depend_on_ids || [])];
                if (!preds.includes(et.id)) preds.push(et.id);
                
                let inactivePreds = [...(taskObj.inactive_dependency_ids || [])];
                const isInactive = (et._inactive_succs || []).includes(sId);
                if (isInactive && !inactivePreds.includes(et.id)) {
                    inactivePreds.push(et.id);
                } else if (!isInactive) {
                    inactivePreds = inactivePreds.filter(id => id !== et.id);
                }

                await this.orm.write("project.task", [sId], {
                    depend_on_ids: [[6, 0, preds]],
                    inactive_dependency_ids: [[6, 0, inactivePreds]]
                });
            }
        }

        // 3. Update active/inactive states for remaining (kept) successors
        const keptSuccs = currentSuccIds.filter(id => originalSuccIds.includes(id));
        for (let sId of keptSuccs) {
            const taskObj = this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === sId);
            if (taskObj) {
                let inactivePreds = [...(taskObj.inactive_dependency_ids || [])];
                const isInactive = (et._inactive_succs || []).includes(sId);
                const wasInactive = (taskObj.inactive_dependency_ids || []).includes(et.id);
                if (isInactive !== wasInactive) {
                    if (isInactive) {
                        if (!inactivePreds.includes(et.id)) inactivePreds.push(et.id);
                    } else {
                        inactivePreds = inactivePreds.filter(id => id !== et.id);
                    }
                    await this.orm.write("project.task", [sId], {
                        inactive_dependency_ids: [[6, 0, inactivePreds]]
                    });
                }
            }
        }

        // Persist predecessor dependency types:
        try {
            const existingDeps = await this.orm.searchRead("project.task.dependency", [["task_id", "=", et.id]], ["depends_on_id", "dependency_type"]);
            const existingPredMap = {};
            existingDeps.forEach(d => {
                const pId = Array.isArray(d.depends_on_id) ? d.depends_on_id[0] : d.depends_on_id;
                existingPredMap[pId] = d.id;
            });

            // For each predecessor, update or create dependency record
            for (let pId of (et._preds || [])) {
                const curType = (et._depTypes && et._depTypes[pId] || 'FS').toLowerCase();
                if (pId in existingPredMap) {
                    await this.orm.write("project.task.dependency", [existingPredMap[pId]], { dependency_type: curType });
                } else {
                    await this.orm.create("project.task.dependency", [{
                        task_id: et.id,
                        depends_on_id: pId,
                        dependency_type: curType
                    }]);
                }
            }

            // Remove dependency records for deleted predecessors
            const removedPredIds = Object.keys(existingPredMap).map(Number).filter(id => !(et._preds || []).includes(id));
            if (removedPredIds.length > 0) {
                const toDelete = removedPredIds.map(id => existingPredMap[id]);
                await this.orm.unlink("project.task.dependency", toDelete);
            }
        } catch (err) {
            console.error("Error saving predecessor dependency types:", err);
        }

        // Persist successor dependency types:
        try {
            const existingSuccDeps = await this.orm.searchRead("project.task.dependency", [["depends_on_id", "=", et.id]], ["task_id", "dependency_type"]);
            const existingSuccMap = {};
            existingSuccDeps.forEach(d => {
                const sId = Array.isArray(d.task_id) ? d.task_id[0] : d.task_id;
                existingSuccMap[sId] = d.id;
            });

            // For each successor, update or create dependency record
            for (let sId of (et._succs || [])) {
                const curType = (et._succDepTypes && et._succDepTypes[sId] || 'FS').toLowerCase();
                if (sId in existingSuccMap) {
                    await this.orm.write("project.task.dependency", [existingSuccMap[sId]], { dependency_type: curType });
                } else {
                    await this.orm.create("project.task.dependency", [{
                        task_id: sId,
                        depends_on_id: et.id,
                        dependency_type: curType
                    }]);
                }
            }

            // Remove dependency records for deleted successors
            const removedSuccIds = Object.keys(existingSuccMap).map(Number).filter(id => !(et._succs || []).includes(id));
            if (removedSuccIds.length > 0) {
                const toDelete = removedSuccIds.map(id => existingSuccMap[id]);
                await this.orm.unlink("project.task.dependency", toDelete);
            }
        } catch (err) {
            console.error("Error saving successor dependency types:", err);
        }

        await this.props.model.load(this.props.model.params);
        await this.onAutoSchedule();
        this.closeEditor();
    }
    addPred() {
        const first = this.props.model.allTasksList.find(t => t.id !== this.state.editorTask.id && !this.state.editorTask._preds.includes(t.id));
        if (first) this.state.editorTask._preds.push(first.id);
    }
    delPred(id) {
        this.state.editorTask._preds = this.state.editorTask._preds.filter(p => p !== id);
    }
    addRes() {
        const first = this.props.model.allUsers.find(u => !this.state.editorTask._resources.includes(u.id));
        if (first) this.state.editorTask._resources.push(first.id);
    }
    delRes(id) {
        this.state.editorTask._resources = this.state.editorTask._resources.filter(r => r !== id);
    }
    updateResource(oldId, newId) {
        const idx = this.state.editorTask._resources.indexOf(oldId);
        if (idx !== -1) this.state.editorTask._resources[idx] = parseInt(newId);
    }
    updatePredecessor(oldId, newId) {
        const idx = this.state.editorTask._preds.indexOf(oldId);
        if (idx !== -1) this.state.editorTask._preds[idx] = parseInt(newId);
    }

    onWindowClick() {
        if (this.state.contextMenu) this.state.contextMenu = null;
    }

    onContextMenu(ev, t) {
        let x = ev.clientX;
        let y = ev.clientY;
        
        if (x + 180 > window.innerWidth) x = window.innerWidth - 180;
        
        // Context menu is very tall (~520px). If it extends past the visible window, force it up!
        if (y + 520 > window.innerHeight) {
            y = window.innerHeight - 530;
        }
        if (y < 10) y = 10;


        const isTimelinePill = !!ev.target.closest('.o_gantt_pill_wrapper');
        let clickDateMs = null;
        if (isTimelinePill) {
            const viewport = ev.target.closest('.o_ug_timeline_viewport');
            if (viewport) {
                const rect = viewport.getBoundingClientRect();
                const scrollLeft = viewport.scrollLeft;
                const absoluteX = (ev.clientX - rect.left) + scrollLeft;
                const px = SCALES[this.state.zI].px;
                const daysOffset = absoluteX / px;
                const clickDate = this.state.tS.plus({ days: daysOffset });
                clickDateMs = clickDate.toMillis();
            }
        }
        this.state.contextMenu = { x, y, t, isTimelinePill, clickDateMs };
    }

    ctxEdit() {
        if (this.state.contextMenu) {
            this.openTaskEditor(this.state.contextMenu.t);
            this.state.contextMenu = null;
        }
    }
    
    ctxFilter(op) {
        if (op === 'Clear') {
            this.state.customFilter = null;
        } else if (['Empty', 'Not empty', 'Today', 'Tomorrow', 'Yesterday', 'This week', 'Next week', 'Last week', 'This month', 'Next month', 'Last month', 'This year', 'Next year', 'Last year'].includes(op)) {
            this.state.customFilter = { op: op, value: '' };
        } else {
            let val = prompt(`Enter value for filter rule: ${op}`);
            if (val !== null) {
                this.state.customFilter = { op: op, value: val };
            }
        }
        this.state.contextMenu = null;
    }

    ctxCopy() {
        if (this.state.contextMenu) {
            this.state.clipboard = { action: 'copy', t: JSON.parse(JSON.stringify(this.state.contextMenu.t)) };
            this.state.contextMenu = null;
        }
    }

    ctxCut() {
        if (this.state.contextMenu) {
            this.state.clipboard = { action: 'cut', t: JSON.parse(JSON.stringify(this.state.contextMenu.t)) };
            this.state.contextMenu = null;
        }
    }

    async ctxConvertToMilestone() {
        if (!this.state.contextMenu) return;
        const t = this.state.contextMenu.t;
        this.state.contextMenu = null;

        await this.orm.write("project.task", [t.id], {
            is_milestone: true,
            date_deadline: t.planned_date_begin,
            effort: 0
        });
        await this.props.model.load(this.props.model.params);
    }

    async ctxIndent() {
        if (!this.state.contextMenu) return;
        const t = this.state.contextMenu.t;
        this.state.contextMenu = null;

        const parentId = t.parent_id ? t.parent_id[0] : false;
        const allTasks = this.props.model.data.flatMap(p => p.tasks);
        const siblings = allTasks.filter(x => (x.parent_id ? x.parent_id[0] : false) === parentId).sort((a, b) => a.sequence - b.sequence);
        const idx = siblings.findIndex(x => x.id === t.id);

        if (idx > 0) {
            const prevSibling = siblings[idx - 1];
            const original = { id: t.id, parent_id: parentId };
            const newVals = { parent_id: prevSibling.id };
            this.pushHistory('update', original, { id: t.id, ...newVals });
            await this.orm.write("project.task", [t.id], newVals);
            await this.props.model.load(this.props.model.params);
        } else {
            alert("Cannot indent: no preceding sibling task.");
        }
    }

    async ctxOutdent() {
        if (!this.state.contextMenu) return;
        const t = this.state.contextMenu.t;
        this.state.contextMenu = null;

        if (t.parent_id) {
            const parentId = t.parent_id[0];
            const allTasks = this.props.model.data.flatMap(p => p.tasks);
            const parentTask = allTasks.find(x => x.id === parentId);
            if (parentTask) {
                const grandParentId = parentTask.parent_id ? parentTask.parent_id[0] : false;
                
                // Get siblings of t
                const siblings = allTasks.filter(x => (x.parent_id ? x.parent_id[0] : false) === parentId).sort((a, b) => a.sequence - b.sequence);
                const tIdx = siblings.findIndex(x => x.id === t.id);
                
                // Tasks below t in the same parent become children of t
                const siblingsBelow = siblings.slice(tIdx + 1);
                
                const original = { id: t.id, parent_id: parentId, sequence: t.sequence };
                
                // Re-sequence grandparent children to make room
                const gpChildren = allTasks.filter(x => (x.parent_id ? x.parent_id[0] : false) === grandParentId).sort((a, b) => a.sequence - b.sequence);
                let targetSeq = (parentTask.sequence || 0) + 1;
                const toShift = gpChildren.filter(x => x.sequence >= targetSeq && x.id !== parentTask.id);
                if (toShift.length > 0) {
                    const shiftIds = toShift.map(x => x.id);
                    // Shift them by 10 to make plenty of room
                    await Promise.all(toShift.map(x => this.orm.write("project.task", [x.id], { sequence: x.sequence + 10 })));
                }
                const newVals = { parent_id: grandParentId, sequence: targetSeq };
                
                this.pushHistory('update', original, { id: t.id, ...newVals });
                await this.orm.write("project.task", [t.id], newVals);
                
                // Update children
                if (siblingsBelow.length > 0) {
                    const childIds = siblingsBelow.map(x => x.id);
                    await this.orm.write("project.task", childIds, { parent_id: t.id });
                    // We don't push child updates to history to keep it simple, or we could use 'create_multi' pattern for updates.
                }

                await this.props.model.load(this.props.model.params);
            }
        } else {
            alert("Cannot outdent: task is already at the top level.");
        }
    }

    async ctxDelete() {
        if (!this.state.contextMenu) return;
        const t = this.state.contextMenu.t;
        this.state.contextMenu = null;
        await this.deleteTask(t.id);
    }

    async ctxColor(clr) {
        if (!this.state.contextMenu) return;
        const t = this.state.contextMenu.t;
        this.state.contextMenu = null;

        const original = { id: t.id, gantt_color: t.gantt_color || false };
        const newVals = { gantt_color: clr || false };
        this.pushHistory('update', original, { id: t.id, ...newVals });
        await this.orm.write("project.task", [t.id], newVals);
        await this.props.model.load(this.props.model.params);
    }

    async ctxSplit() {
        if (!this.state.contextMenu) return;
        const { t, clickDateMs } = this.state.contextMenu;
        this.state.contextMenu = null;

        const s = deserializeDateTime(t.planned_date_begin);
        const e = deserializeDateTime(t.date_deadline);

        let midPoint;
        if (clickDateMs) {
            midPoint = DateTime.fromMillis(clickDateMs);
        } else {
            const diffMs = e.diff(s).as('milliseconds');
            midPoint = s.plus({ milliseconds: diffMs / 2 });
        }

        if (midPoint <= s || midPoint >= e) {
            alert("Cannot split task outside of its duration bounds.");
            return;
        }

        const midPointStr = serializeDateTime(midPoint);
        const diffDays = e.diff(s).as('days');

        const secondPartStart = midPoint.plus({ hours: diffDays > 2 ? 24 : 1 });
        const secondPartStartStr = serializeDateTime(secondPartStart);

        let finalEndStr = t.date_deadline;
        if (secondPartStart >= e) {
            alert("Task is too short to visually split with a gap.");
            return;
        }

        const originalPart1 = { id: t.id, date_deadline: t.date_deadline };
        const newValsPart1 = { date_deadline: midPointStr };

        const valsPart2 = {
            name: t.name + " (Part 2)",
            project_id: t.project_id ? t.project_id[0] : false,
            parent_id: t.parent_id ? t.parent_id[0] : false,
            planned_date_begin: secondPartStartStr,
            date_deadline: finalEndStr,
            gantt_color: t.gantt_color,
            sequence: (t.sequence || 0) + 1,
            depend_on_ids: [[4, t.id]]
        };

        this.pushHistory('update', originalPart1, { id: t.id, ...newValsPart1 });
        await this.orm.write("project.task", [t.id], newValsPart1);

        const newIdList = await this.orm.create("project.task", [valsPart2]);
        if (newIdList && newIdList.length > 0) {
            this.pushHistory('create', null, { id: newIdList[0], vals: valsPart2 });
        }

        await this.props.model.load(this.props.model.params);
    }

    _buildCopyVals(taskToCopy, targetProjectId, targetParentId, sequence, allTasks) {
        const vals = {
            name: taskToCopy.name,
            project_id: targetProjectId,
            sequence: sequence,
            planned_date_begin: taskToCopy.planned_date_begin,
            date_deadline: taskToCopy.date_deadline,
            user_ids: [[6, 0, taskToCopy.user_ids || []]],
            actual_progress: taskToCopy.actual_progress || 0,
            cost: taskToCopy.cost || 0,
            complexity: taskToCopy.complexity || 'normal',
            gantt_color: taskToCopy.gantt_color || '',
            effort: taskToCopy.effort || 0,
            scheduling_mode: taskToCopy.scheduling_mode || 'normal',
            depend_on_ids: false
        };

        if (targetParentId !== undefined) vals.parent_id = targetParentId;

        const children = allTasks.filter(t => t.parent_id && t.parent_id[0] === taskToCopy.id);
        children.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

        if (children.length > 0) {
            vals.child_ids = [];
            for (let i = 0; i < children.length; i++) {
                const childVals = this._buildCopyVals(children[i], targetProjectId, undefined, (i + 1) * 10, allTasks);
                vals.child_ids.push([0, 0, childVals]);
            }
        }
        return vals;
    }

    async ctxAdd(action) {
        if (!this.state.contextMenu) return;
        const targetTask = this.state.contextMenu.t;
        this.state.contextMenu = null;

        let pId = targetTask.project_id ? targetTask.project_id[0] : false;
        let parentId = targetTask.parent_id ? targetTask.parent_id[0] : false;
        const allTasks = this.props.model.data.flatMap(p => p.tasks);

        let isMilestone = action === 'milestone' || (targetTask.is_milestone && ['subtask', 'successor', 'predecessor'].includes(action));
        let taskName = isMilestone ? "New milestone" : (action === 'subtask' ? "New sub-task" : "New task");

        let vals = {
            name: taskName,
            project_id: pId,
            is_milestone: isMilestone,
            planned_date_begin: targetTask.planned_date_begin,
            date_deadline: targetTask.date_deadline,
            user_ids: [[6, 0, targetTask.user_ids || []]],
            actual_progress: 0,
            cost: targetTask.cost || 0,
            complexity: targetTask.complexity || 'normal',
            gantt_color: targetTask.gantt_color || '',
            effort: targetTask.effort || 0,
            scheduling_mode: targetTask.scheduling_mode || 'normal'
        };

        if (isMilestone) {
            vals.date_deadline = vals.planned_date_begin;
            vals.effort = 0;
            vals.cost = 0;
        }

        let seqUpdates = [];
        let newSeq = 10;

        if (['above', 'below', 'milestone', 'successor', 'predecessor'].includes(action)) {
            vals.parent_id = parentId;
            let siblings = allTasks.filter(t => (t.parent_id ? t.parent_id[0] : false) === parentId && (t.project_id ? t.project_id[0] : false) === pId);
            let targetIdx = siblings.findIndex(t => t.id === targetTask.id);
            let offset = (action === 'above' || action === 'predecessor') ? 0 : 1;

            let currentSeq = 10;
            for (let i = 0; i < siblings.length; i++) {
                if (i === targetIdx + offset) {
                    newSeq = currentSeq;
                    currentSeq += 10;
                }
                if (siblings[i].sequence !== currentSeq) {
                    seqUpdates.push({ id: siblings[i].id, sequence: currentSeq });
                }
                currentSeq += 10;
            }
            if (targetIdx + offset >= siblings.length) newSeq = currentSeq;
            vals.sequence = newSeq;
        } else if (action === 'subtask') {
            vals.parent_id = targetTask.id;
            let siblings = allTasks.filter(t => (t.parent_id ? t.parent_id[0] : false) === targetTask.id);
            vals.sequence = siblings.length > 0 ? Math.max(...siblings.map(s => s.sequence || 0)) + 10 : 10;
        }

        if (seqUpdates.length > 0) {
            await Promise.all(seqUpdates.map(u => this.orm.write("project.task", [u.id], { sequence: u.sequence })));
        }

        const newIds = await this.orm.create("project.task", [vals]);
        const newId = newIds[0];
        this.pushHistory('create', null, { id: newId, vals });

        if (action === 'successor') {
            await this.orm.write("project.task", [newId], { depend_on_ids: [[4, targetTask.id]] });
        } else if (action === 'predecessor') {
            await this.orm.write("project.task", [targetTask.id], { depend_on_ids: [[4, newId]] });
        }

        await this.props.model.load(this.props.model.params);
    }

    async ctxPaste() {
        if (!this.state.contextMenu || !this.state.clipboard) return;
        const targetTask = this.state.contextMenu.t;
        const clip = this.state.clipboard;
        this.state.contextMenu = null;

        let pId = targetTask.project_id ? targetTask.project_id[0] : false;
        let parentId = targetTask.parent_id ? targetTask.parent_id[0] : false;
        const allTasks = this.props.model.data.flatMap(p => p.tasks);

        // Re-sequence siblings to guarantee exact placement
        let siblings = allTasks.filter(t => (t.parent_id ? t.parent_id[0] : false) === parentId && (t.project_id ? t.project_id[0] : false) === pId);
        if (clip.action === 'cut') siblings = siblings.filter(t => t.id !== clip.t.id);

        let targetIdx = siblings.findIndex(t => t.id === targetTask.id);

        let seqUpdates = [];
        let currentSeq = 10;
        let newSeq = 10;

        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i].sequence !== currentSeq) {
                seqUpdates.push({ id: siblings[i].id, sequence: currentSeq });
            }
            currentSeq += 10;
            if (i === targetIdx) {
                newSeq = currentSeq;
                currentSeq += 10;
            }
        }
        if (targetIdx === -1 || targetIdx === siblings.length - 1) newSeq = currentSeq;

        if (seqUpdates.length > 0) {
            await Promise.all(seqUpdates.map(u => this.orm.write("project.task", [u.id], { sequence: u.sequence })));
        }

        if (clip.action === 'copy') {
            const allTasks = this.props.model.data.flatMap(p => p.tasks);
            const rootVals = this._buildCopyVals(clip.t, pId, parentId, newSeq, allTasks);

            const newIds = await this.orm.create("project.task", [rootVals]);
            const createdTree = await this.orm.searchRead("project.task", [["id", "child_of", newIds[0]]], ["id"]);

            this.pushHistory('create_multi', null, { ids: createdTree.map(t => t.id) });
        } else if (clip.action === 'cut') {
            const oldVals = {
                id: clip.t.id,
                project_id: clip.t.project_id ? clip.t.project_id[0] : false,
                parent_id: clip.t.parent_id ? clip.t.parent_id[0] : false,
                sequence: clip.t.sequence
            };
            const newVals = { id: clip.t.id, project_id: pId, parent_id: parentId, sequence: newSeq };
            this.pushHistory('update', oldVals, newVals);
            await this.orm.write("project.task", [clip.t.id], newVals);
            this.state.clipboard = null; // Clear after successful cut paste
        }

        await this.props.model.load(this.props.model.params);
    }

    onBMD(ev, t) {
        ev.preventDefault();
        const successors = this._getSuccessorChain(t.id);

        console.log(`[DRAG] onBMD | Task: ${t.id} "${t.name}" | depend_on_ids:`, t.depend_on_ids);

        let minDx = -Infinity;
        let depType = this.state.config.gantt_dependency_type || 'FS';
        let tasks = (this.props.model.data || []).flatMap(p => p.tasks);

        let preds = tasks.filter(x => (t.depend_on_ids || []).includes(x.id) && !(t.inactive_dependency_ids || []).includes(x.id));

        if (preds.length > 0) {
            let maxDiff = null;
            preds.forEach(p => {
                let pStart = deserializeDateTime(p.planned_date_begin);
                let pEnd = deserializeDateTime(p.date_deadline);
                let tStart = deserializeDateTime(t.planned_date_begin);
                let tEnd = deserializeDateTime(t.date_deadline);

                let specificType = (this.props.model.dependencyMap && this.props.model.dependencyMap[`${t.id}_${p.id}`]) || depType;
                let diff = 0;
                if (specificType === 'FS') diff = pEnd.diff(tStart, 'days').days;
                else if (specificType === 'SS') diff = pStart.diff(tStart, 'days').days;
                else if (specificType === 'FF') diff = pEnd.diff(tEnd, 'days').days;
                else if (specificType === 'SF') diff = pStart.diff(tEnd, 'days').days;

                if (maxDiff === null || diff > maxDiff) maxDiff = diff;
            });
            if (maxDiff !== null) {
                minDx = Math.min(0, maxDiff); // Prevent teleporting if already violating
            }
        }

        this.state.dragOffset = 0;
        this.state.dragChainIds = successors.map(s => String(s.id));
        this.state.drag = {
            t, sx: ev.clientX, startX: ev.clientX, minDx: minDx,
            os: deserializeDateTime(t.planned_date_begin), OE: deserializeDateTime(t.date_deadline),
            chain: successors.map(st => ({
                t: st, os: deserializeDateTime(st.planned_date_begin), OE: deserializeDateTime(st.date_deadline)
            }))
        };

        this._winMM = (e) => this.onMM(e);
        this._winMU = () => this.onMU();
        window.addEventListener('mousemove', this._winMM);
        window.addEventListener('mouseup', this._winMU);
    }
    _getSuccessorChain(taskId) {
        let chain = new Set(); let stack = [String(taskId)];
        let tasks = (this.props.model.data || []).flatMap(p => p.tasks);
        while (stack.length) {
            let curId = stack.pop();
            tasks.filter(t => (t.depend_on_ids || []).some(id => String(id) === curId && !(t.inactive_dependency_ids || []).includes(Number(id)))).forEach(s => {
                if (!chain.has(String(s.id))) { chain.add(String(s.id)); stack.push(String(s.id)); }
            });
        }
        const chainIds = Array.from(chain);
        return tasks.filter(t => chainIds.includes(String(t.id)));
    }
    async onAutoSchedule() {
        const data = this.props.model.data; if (!data || !data.length) return;
        const allTasks = data.flatMap(p => p.tasks);
        const taskMap = {}; allTasks.forEach(t => taskMap[t.id] = {
            ...t,
            s: deserializeDateTime(t.planned_date_begin),
            e: deserializeDateTime(t.date_deadline),
            dur: deserializeDateTime(t.date_deadline).diff(deserializeDateTime(t.planned_date_begin), 'minutes').minutes
        });

        // Simple Forward Pass Auto-Scheduling
        let changed = true; let iterations = 0;
        while (changed && iterations < 100) {
            changed = false; iterations++;
            allTasks.forEach(t => {
                const cur = taskMap[t.id];
                const activePreds = (t.depend_on_ids || []).filter(pId => !(t.inactive_dependency_ids || []).includes(pId));
                if (!activePreds.length) return;

                let maxEnd = null;
                activePreds.forEach(pId => {
                    const pred = taskMap[pId];
                    if (pred) {
                        if (!maxEnd || pred.e > maxEnd) maxEnd = pred.e;
                    }
                });

                if (maxEnd && cur.s < maxEnd) {
                    cur.s = maxEnd;
                    // Weekend awareness
                    if (cur.s.weekday === 6) cur.s = cur.s.plus({ days: 2 }).startOf('day');
                    else if (cur.s.weekday === 7) cur.s = cur.s.plus({ days: 1 }).startOf('day');

                    cur.e = cur.s.plus({ minutes: cur.dur });
                    changed = true;
                }
            });
        }

        const vals_list = Object.values(taskMap).map(tm => ({
            id: tm.id,
            planned_date_begin: serializeDateTime(tm.s),
            date_deadline: serializeDateTime(tm.e)
        }));

        await this.orm.call("project.task", "action_batch_update_gantt_dates", [vals_list]);
        await this.props.model.load(this.props.model.params);
    }
    onDepStart(ev, t, side) {
        ev.stopPropagation(); const rect = ev.target.getBoundingClientRect(); const viewRect = this.tlRef.el.getBoundingClientRect();
        this.state.depDrag = { source: t, side, x1: rect.left + rect.width / 2 - viewRect.left + this.tlRef.el.scrollLeft, y1: rect.top + rect.height / 2 - viewRect.top + this.tlRef.el.scrollTop, x2: rect.left + rect.width / 2 - viewRect.left + this.tlRef.el.scrollLeft, y2: rect.top + rect.height / 2 - viewRect.top + this.tlRef.el.scrollTop, mouseX: ev.clientX, mouseY: ev.clientY, valid: false, targetName: null, targetId: null };
    }
    onPEnter(t) {
        this.state.hId = t.id;
        this.state.hoverTask = t;
    }
    onPLeave() {
        this.state.hId = null;
        this.state.hoverTask = null;
    }
    onMM(ev) {
        this.state.mouseX = ev.clientX + 15;
        this.state.mouseY = ev.clientY + 15;
        if (this.state.drag) {
            let px = SCALES[this.state.zI].px; const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days));
            if (this.state.zI === 2 || dDiff > 350) px = (this.totalGridWidth) / 365.25; else if (SCALES[this.state.zI].unit === 'day' && dDiff <= 7) px = 180;

            const dragStartX = this.state.drag.sx ?? this.state.drag.startX ?? ev.clientX;
            let rawOffset = (ev.clientX - dragStartX) / px;

            if (this.state.drag.minDx !== -Infinity) {
                if (rawOffset < this.state.drag.minDx) {
                    rawOffset = this.state.drag.minDx;
                }
            }

            this.state.dragOffset = Number.isNaN(rawOffset) ? 0 : rawOffset;
        } else if (this.state.depDrag) {
            const rect = this.tlRef.el.getBoundingClientRect();
            this.state.depDrag.x2 = ev.clientX - rect.left + this.tlRef.el.scrollLeft;
            this.state.depDrag.y2 = ev.clientY - rect.top + this.tlRef.el.scrollTop;
            this.state.depDrag.mouseX = ev.clientX; this.state.depDrag.mouseY = ev.clientY;
            const targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
            const row = targetEl?.closest('.o_ug_row');
            if (row && row.dataset.id) {
                const rid = row.dataset.id;
                if (!rid.startsWith('proj_')) {
                    const tid = parseInt(rid);
                    if (tid !== this.state.depDrag.source.id) {
                        const tData = this.props.model.data.flatMap(p => p.tasks).find(x => x.id === tid);
                        this.state.depDrag.targetId = tid; this.state.depDrag.targetName = tData ? tData.name : null; this.state.depDrag.valid = true;
                    } else { this.state.depDrag.targetId = null; this.state.depDrag.targetName = null; this.state.depDrag.valid = false; }
                } else { this.state.depDrag.targetId = null; this.state.depDrag.targetName = null; this.state.depDrag.valid = false; }
            } else { this.state.depDrag.targetId = null; this.state.depDrag.targetName = null; this.state.depDrag.valid = false; }
        }
    }
    async onMU() {
        if (this._winMM) { window.removeEventListener('mousemove', this._winMM); this._winMM = null; }
        if (this._winMU) { window.removeEventListener('mouseup', this._winMU); this._winMU = null; }

        if (this.state.drag) {
            this.pushState();
            let { t, os, OE, chain } = this.state.drag;
            let dx = this.state.dragOffset;
            if (SCALES[this.state.zI].unit === 'day') dx = Math.round(dx);

            // OPTIMISTIC LOCAL UPDATE: Prevent snap-back instantly
            const newBegin = serializeDateTime(os.plus({ days: dx }));
            const newEnd = serializeDateTime(OE.plus({ days: dx }));
            t.planned_date_begin = newBegin; t.date_deadline = newEnd;
            const vals_list = [{ id: t.id, planned_date_begin: newBegin, date_deadline: newEnd }];

            chain.forEach(item => {
                const cBegin = serializeDateTime(item.os.plus({ days: dx }));
                const cEnd = serializeDateTime(item.OE.plus({ days: dx }));
                item.t.planned_date_begin = cBegin; item.t.date_deadline = cEnd;
                vals_list.push({ id: item.t.id, planned_date_begin: cBegin, date_deadline: cEnd });
            });

            // CLEAR DRAG STATE IMMEDIATELY (Visuals are already in sync via model update)
            this.state.drag = null; this.state.dragOffset = 0; this.state.dragChainIds = [];

            try {
                // Background Sync: No 'await' on UI-blocking path if possible, but Odoo ORM needs to finish.
                // We wrap it to handle the potential 3s timeout gracefully.
                this.orm.call("project.task", "action_batch_update_gantt_dates", [vals_list]).then(() => {
                    this.props.model.load(this.props.model.params);
                }).catch(e => console.warn("Background sync delay", e));
            } catch (err) {
                console.error("Batch update failed", err);
            }
        }
        else if (this.state.depDrag) {
            if (this.state.depDrag.valid && this.state.depDrag.targetId) {
                let tid = this.state.depDrag.targetId;
                let curDeps = (this.props.model.data.flatMap(p => p.tasks || []).find(t => t && t.id === tid)?.depend_on_ids || []);
                if (!curDeps.includes(this.state.depDrag.source.id)) {
                    await this.orm.write("project.task", [tid], { depend_on_ids: [[4, this.state.depDrag.source.id]] });
                    await this.props.model.load(this.props.model.params);
                }
            }
            this.state.depDrag = null;
        }
    }
    _taskEdgeX(t, side) {
        let px = SCALES[this.state.zI].px; const dDiff = Math.abs(Math.round(this.state.tE.diff(this.state.tS, 'days').days)); if (this.state.zI === 2 || dDiff > 350) px = (this.totalGridWidth) / 365.25; else if (SCALES[this.state.zI].unit === 'day' && dDiff <= 7) px = 180;
        let s = deserializeDateTime(t.planned_date_begin), e = deserializeDateTime(t.date_deadline);
        const sId = String(t.id);
        if (this.state.drag && (String(this.state.drag.t.id) === sId || this.state.dragChainIds.includes(sId))) {
            const dx = this.state.dragOffset || 0;
            s = s.plus({ days: dx }); e = e.plus({ days: dx });
        }
        let l = (s.diff(this.state.tS).as('days')) * px, w = (e.diff(s).as('days')) * px;
        if (t.is_milestone) return side === 'start' ? l - 9 : l + 9;
        return side === 'start' ? l : l + w;
    }
    _taskRowY(task) {
        const rh = this.state.config.gantt_row_height; let r = 0;
        for (const p of this.visibleProjects) { if (p.id === task.id) return r * rh + rh / 2; r++; for (const t of p.visibleTasks) { if (t.id === task.id) return r * rh + rh / 2; r++; } }
        return NaN;
    }
    get depSvgHeight() { const rh = this.state.config.gantt_row_height; let r = 0; for (const p of this.visibleProjects) { r++; r += p.visibleTasks.length; } return r * rh + 50; }
    get depLines() {
        let l = []; let aT = {}; (this.props.model.data || []).forEach(p => p.tasks.forEach(t => aT[t.id] = t));
        const visIds = new Set(); this.visibleProjects.forEach(p => { visIds.add(p.id); p.visibleTasks.forEach(vt => visIds.add(vt.id)); });
        let depType = this.state.config.gantt_dependency_type || 'FS';

        this.visibleProjects.forEach(p => p.visibleTasks.forEach(t => (t.depend_on_ids || []).forEach(pI => {
            if (!visIds.has(pI)) return; let pr = aT[pI];
            if (pr) {
                let specificType = (this.props.model.dependencyMap && this.props.model.dependencyMap[`${t.id}_${pI}`]) || depType;
                let x1, x2;
                if (specificType === 'FS') { x1 = this._taskEdgeX(pr, 'end'); x2 = this._taskEdgeX(t, 'start'); }
                else if (specificType === 'SS') { x1 = this._taskEdgeX(pr, 'start'); x2 = this._taskEdgeX(t, 'start'); }
                else if (specificType === 'FF') { x1 = this._taskEdgeX(pr, 'end'); x2 = this._taskEdgeX(t, 'end'); }
                else if (specificType === 'SF') { x1 = this._taskEdgeX(pr, 'start'); x2 = this._taskEdgeX(t, 'end'); }

                let y1 = this._taskRowY(pr), y2 = this._taskRowY(t);
                if (isNaN(y1) || isNaN(y2)) return;

                let path = '';
                const gap = 12; // Gap to clear task boxes

                if (specificType === 'FS') {
                    if (x2 >= x1 + gap) {
                        let midX = x1 + (x2 - x1) / 2;
                        path = `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
                    } else {
                        let midY = y1 + (y2 - y1) / 2;
                        path = `M${x1},${y1} L${x1 + gap},${y1} L${x1 + gap},${midY} L${x2 - gap},${midY} L${x2 - gap},${y2} L${x2},${y2}`;
                    }
                } else if (specificType === 'SS') {
                    let mX = Math.min(x1, x2) - gap;
                    path = `M${x1},${y1} L${mX},${y1} L${mX},${y2} L${x2},${y2}`;
                } else if (specificType === 'FF') {
                    let mX = Math.max(x1, x2) + gap;
                    path = `M${x1},${y1} L${mX},${y1} L${mX},${y2} L${x2},${y2}`;
                } else if (specificType === 'SF') {
                    if (x1 >= x2 + gap) {
                        let midX = x2 + (x1 - x2) / 2;
                        path = `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
                    } else {
                        let midY = y1 + (y2 - y1) / 2;
                        path = `M${x1},${y1} L${x1 - gap},${y1} L${x1 - gap},${midY} L${x2 + gap},${midY} L${x2 + gap},${y2} L${x2},${y2}`;
                    }
                }

                l.push({ id: `d_${pI}_${t.id}`, path: path, isCritical: t.isCritical && pr.isCritical && this.state.config.gantt_show_critical_path, isInactive: (t.inactive_dependency_ids || []).includes(pI) });
            }
        }))); return l;
    }
    async setBaseline() {
        const allTasks = this.props.model.data.flatMap(p => p.tasks);
        if (!allTasks.length) return;
        await this.orm.call("project.task", "action_set_baseline", [allTasks.map(t => t.id)]);
        await this.props.model.load(this.props.model.params);
    }
    async toggleVersions() {
        this.state.versionsOpen = !this.state.versionsOpen;
        if (this.state.versionsOpen) await this.loadVersions();
    }
    async loadVersions() {
        const pId = this.props.model.data[0]?.r_id;
        if (!pId) return;
        this.state.versions = await this.orm.searchRead("project.gantt.version", [["project_id", "=", pId]], ["name", "date_saved", "task_count"]);
    }
    async saveVersionNamed() {
        const name = this.state.newVersionName || `Version ${this.state.versions.length + 1}`;
        const pId = this.props.model.data[0]?.r_id;
        if (!pId) return;
        await this.orm.call("project.project", "action_save_gantt_version", [pId, name]);
        this.state.showSaveVersion = false;
        this.state.newVersionName = "";
        await this.loadVersions();
    }
    async restoreVersion(v) {
        if (!confirm(`Restore schedule to "${v.name}"? This will overwrite current task dates.`)) return;
        await this.orm.call("project.gantt.version", "action_restore", [v.id]);
        this.state.activeVersionId = v.id;
        await this.props.model.load(this.props.model.params);
    }
    pushHistory(type = 'snapshot', oldVal = null, newVal = null) {
        this.state.history.push({ type, oldVal, newVal });
        if (this.state.history.length > 50) this.state.history.shift();
        this.state.redoStack = [];
    }
    pushState() {
        const snapshot = {};
        this.props.model.data.forEach(p => p.tasks.forEach(t => snapshot[t.id] = { s: t.planned_date_begin, e: t.date_deadline }));
        this.pushHistory('snapshot', null, snapshot);
    }
    cleanWriteVals(rawVals) {
        if (!rawVals) return {};
        const allowedFields = [
            'name', 'planned_date_begin', 'date_deadline', 'is_milestone',
            'actual_progress', 'cost', 'complexity', 'gantt_color', 'effort',
            'scheduling_mode', 'constraint_type', 'constraint_date',
            'manually_scheduled', 'rollup', 'inactive', 'calendar_id',
            'ignore_resource_calendar', 'effort_driven', 'project_border',
            'depend_on_ids', 'inactive_dependency_ids', 'user_ids',
            'sequence', 'parent_id', 'stage_id'
        ];
        const vals = {};
        for (const field of allowedFields) {
            if (!(field in rawVals)) continue;
            let val = rawVals[field];
            if (val === undefined) continue;

            // Handle many2one represented as [id, name]
            if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'number' && typeof val[1] === 'string') {
                vals[field] = val[0];
                continue;
            }

            if (field === 'calendar_id') {
                vals[field] = (val === 'false' || val === false || !val) ? false : parseInt(val, 10);
                continue;
            }

            // Handle relation fields (many2many / one2many) if they are raw arrays of numbers
            if (['depend_on_ids', 'inactive_dependency_ids', 'user_ids'].includes(field)) {
                if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) && val[0][0] === 6) {
                    vals[field] = val;
                } else if (Array.isArray(val)) {
                    const ids = val.map(x => (Array.isArray(x) ? x[0] : x)).filter(x => typeof x === 'number');
                    vals[field] = [[6, 0, ids]];
                }
                continue;
            }

            // Standard conversion for dates
            if (['planned_date_begin', 'date_deadline', 'constraint_date'].includes(field) && typeof val === 'string') {
                vals[field] = val.replace('T', ' ').trim();
                if (vals[field] && vals[field].length === 16) {
                    vals[field] += ':00';
                }
                continue;
            }

            vals[field] = val;
        }
        return vals;
    }
    async undo() {
        if (!this.state.history.length) return;
        const entry = this.state.history.pop();
        if (entry.type === 'snapshot') {
            const current = {};
            this.props.model.data.forEach(p => p.tasks.forEach(t => current[t.id] = { s: t.planned_date_begin, e: t.date_deadline }));
            this.state.redoStack.push({ type: 'snapshot', oldVal: null, newVal: current });
            await this._applySnapshot(entry.newVal);
        } else if (entry.type === 'create' || entry.type === 'create_multi') {
            this.state.redoStack.push(entry);
            const ids = entry.type === 'create' ? [entry.newVal.id] : entry.newVal.ids;
            await this.orm.write("project.task", ids, { active: false });
            await this.props.model.load(this.props.model.params);
        } else {
            this.state.redoStack.push(entry);
            await this.orm.write("project.task", [entry.oldVal.id], this.cleanWriteVals(entry.oldVal));
            await this.props.model.load(this.props.model.params);
        }
    }
    async redo() {
        if (!this.state.redoStack.length) return;
        const entry = this.state.redoStack.pop();
        if (entry.type === 'snapshot') {
            const current = {};
            this.props.model.data.forEach(p => p.tasks.forEach(t => current[t.id] = { s: t.planned_date_begin, e: t.date_deadline }));
            this.state.history.push({ type: 'snapshot', oldVal: null, newVal: current });
            await this._applySnapshot(entry.newVal);
        } else if (entry.type === 'create' || entry.type === 'create_multi') {
            this.state.history.push(entry);
            const ids = entry.type === 'create' ? [entry.newVal.id] : entry.newVal.ids;
            await this.orm.write("project.task", ids, { active: true });
            await this.props.model.load(this.props.model.params);
        } else {
            this.state.history.push(entry);
            await this.orm.write("project.task", [entry.newVal.id], this.cleanWriteVals(entry.newVal));
            await this.props.model.load(this.props.model.params);
        }
    }
    async _applySnapshot(snap) {
        const vals = Object.keys(snap).map(id => ({ id, planned_date_begin: snap[id].s, date_deadline: snap[id].e }));
        await this.orm.call("project.task", "action_batch_update_gantt_dates", [vals]);
        await this.props.model.load(this.props.model.params);
    }
    get progressLinePath() {
        const rh = this.state.config.gantt_row_height;
        const tx = this.todayX;
        let points = [`${tx},0`];
        let curY = 0;
        for (const p of this.visibleProjects) {
            curY += rh;
            points.push(`${tx},${curY}`);
            for (const t of p.visibleTasks) {
                const sX = this.getDateX(t.planned_date_begin);
                const eX = this.getDateX(t.date_deadline, true);
                if (sX !== null && eX !== null) {
                    const progX = sX + (eX - sX) * ((t.actual_progress || 0) / 100);
                    points.push(`${progX},${curY + rh / 2}`);
                } else {
                    points.push(`${tx},${curY + rh / 2}`);
                }
                curY += rh;
                points.push(`${tx},${curY}`);
            }
        }
        return "M" + points.join(" L");
    }
    getTaskPredecessors(taskId) {
        const tasks = (this.props.model.data || []).flatMap(p => p.tasks);
        const task = tasks.find(t => t.id === taskId);
        if (!task || !task.depend_on_ids) return [];
        return tasks.filter(t => task.depend_on_ids.includes(t.id));
    }
    getTaskSuccessors(taskId) {
        const tasks = (this.props.model.data || []).flatMap(p => p.tasks);
        return tasks.filter(t => (t.depend_on_ids || []).includes(taskId));
    }
    async deleteTask(id) {
        if (!confirm("Are you sure you want to delete this task?")) return;
        await this.orm.unlink("project.task", [id]);
        await this.props.model.load(this.props.model.params);
        this.closeEditor();
    }
}

export class UltimateGanttController extends Component {
    static template = xml`
        <div class="h-100 d-flex flex-column bg-view overflow-hidden o_ultimate_gantt_controller">
            <Layout display="props.display">
                <t t-set-slot="control-panel-create-button"><button class="btn btn-primary fw-bold px-3 py-1 shadow-none" style="font-size: 13px;" t-on-click="() => model.onNewTask()">NEW</button></t>
                <t t-set-slot="layout-actions"><SearchBar/></t>
                <t t-set-slot="control-panel-additional-actions"><CogMenu/></t>
                <t t-set-slot="default"><div class="o_ultimate_gantt_content d-flex flex-column" style="height: calc(100vh - 120px); min-height: 0;"><UltimateGanttRenderer t-props="{model: model, resModel: props.resModel, domain: props.domain}"/></div></t>
            </Layout>
        </div>
    `;
    static components = { UltimateGanttRenderer, Layout, SearchBar, CogMenu };
    setup() { this.model = useModel(this.props.Model, { resModel: this.props.resModel, domain: this.props.domain }); }
}

export const ultimateGanttView = {
    type: "gantt", display_name: "Ultimate Gantt Pro", icon: "oi oi-view-gantt", multiRecord: true,
    Controller: UltimateGanttController, Model: UltimateGanttModel, Renderer: UltimateGanttRenderer,
    props: (gp, view) => ({ ...gp, Model: view.Model, Renderer: view.Renderer, Controller: view.Controller }),
};
registry.category("views").add("ultimate_gantt", ultimateGanttView);













