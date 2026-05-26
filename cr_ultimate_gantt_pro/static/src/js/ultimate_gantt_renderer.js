/** @odoo-module **/

import { Component, xml, onMounted, useRef } from "@odoo/owl";
import { deserializeDateTime } from "@web/core/l10n/dates";

export class UltimateGanttRenderer extends Component {
    static template = xml`
        <div class="o_ultimate_gantt_view" t-ref="root">
            <div class="o_ultimate_gantt_header">
                <div class="d-flex align-items-center gap-3">
                    <h4 class="mb-0"><i class="oi oi-view-gantt me-2"/>Ultimate Gantt Pro</h4>
                    <span class="badge rounded-pill bg-primary"><t t-esc="props.model.data?.length || 0"/> Tasks</span>
                </div>
                <div class="ms-auto d-flex gap-2">
                    <button class="btn btn-outline-primary btn-sm" t-on-click="onSetBaseline">
                        <i class="oi oi-settingsme-1"/> Set Baseline
                    </button>
                    <button class="btn btn-outline-danger btn-sm" t-on-click="onCriticalPath">
                        <i class="oi oi-lightbulb me-1"/> Critical Path
                    </button>
                    <select class="form-select form-select-sm" style="width: 100px;">
                        <option>Days</option>
                        <option>Weeks</option>
                        <option>Months</option>
                    </select>
                </div>
            </div>
            <div class="o_ultimate_gantt_container">
                <!-- Sidebar -->
                <div class="o_ultimate_gantt_sidebar">
                    <div class="o_ultimate_gantt_sidebar_header">Task Name</div>
                    <t t-foreach="props.model.data" t-as="task" t-key="task.id">
                        <div class="o_ultimate_gantt_task_row px-3 d-flex align-items-center">
                            <span class="text-truncate" t-att-title="task.name">
                                <small class="text-muted me-1" t-esc="task.wbs_number"/>
                                <t t-esc="task.name"/>
                            </span>
                        </div>
                    </t>
                </div>
                
                <!-- Timeline -->
                <div class="o_ultimate_gantt_timeline" t-ref="timeline">
                    <!-- Grid Lines Background -->
                    <div class="o_ultimate_gantt_grid"/>
                    
                    <!-- SVG Layer for Dependencies -->
                    <svg class="o_ultimate_gantt_svg" t-ref="svg">
                        <t t-foreach="dependencies" t-as="dep" t-key="dep.id">
                            <line t-att-x1="dep.x1" t-att-y1="dep.y1" t-att-x2="dep.x2" t-att-y2="dep.y2" 
                                  class="o_ultimate_gantt_dependency_line"/>
                        </t>
                    </svg>

                    <!-- Task Bars -->
                    <t t-foreach="props.model.data" t-as="task" t-key="task.id">
                        <div class="o_ultimate_gantt_task_row_tl" t-att-data-id="task.id">
                            <div class="o_ultimate_gantt_task_bar" t-att-style="getTaskStyle(task)">
                                <div class="o_ultimate_gantt_progress_actual" t-att-style="'width: ' + (task.actual_progress || 0) + '%'"/>
                                <div class="o_ultimate_gantt_progress_timesheet" t-att-style="'height: 2px; bottom: 0; background: #fff; width: ' + (task.timesheet_progress || 0) + '%'"/>
                                <div class="o_ultimate_gantt_task_label d-flex justify-content-between px-2 w-100">
                                    <span class="small"><t t-esc="task.actual_progress || 0"/>%</span>
                                </div>
                            </div>
                            <div t-if="task.baseline_start_date" class="o_ultimate_gantt_baseline_bar" t-att-style="getBaselineStyle(task)"/>
                        </div>
                    </t>
                </div>
            </div>
        </div>
    `;

    setup() {
        this.root = useRef("root");
        this.timeline = useRef("timeline");
        this.svg = useRef("svg");
        
        // Mock timeline settings
        this.pxPerDay = 40;
        this.startDate = deserializeDateTime(this.props.model.data[0]?.planned_date_begin || new Date());
        
        onMounted(() => {
            this.updateDependencies();
        });
    }

    getTaskStyle(task) {
        if (!task.planned_date_begin || !task.date_deadline) return "display: none;";
        const start = deserializeDateTime(task.planned_date_begin);
        const stop = deserializeDateTime(task.date_deadline);
        const left = (start - this.startDate) / (1000 * 60 * 60 * 24) * this.pxPerDay;
        const width = (stop - start) / (1000 * 60 * 60 * 24) * this.pxPerDay;
        const color = task.gantt_color || '#4285f4';
        return `left: ${left + 20}px; width: ${Math.max(width, 20)}px; background: ${color};`;
    }

    getBaselineStyle(task) {
        if (!task.baseline_start_date || !task.baseline_end_date) return "display: none;";
        const start = deserializeDateTime(task.baseline_start_date);
        const stop = deserializeDateTime(task.baseline_end_date);
        const left = (start - this.startDate) / (1000 * 60 * 60 * 24) * this.pxPerDay;
        const width = (stop - start) / (1000 * 60 * 60 * 24) * this.pxPerDay;
        return `left: ${left + 20}px; width: ${Math.max(width, 20)}px;`;
    }

    get dependencies() {
        // Calculate SVG line coordinates based on task positions
        const deps = [];
        this.props.model.data.forEach((task, index) => {
            if (task.depend_on_ids && task.depend_on_ids.length) {
                task.depend_on_ids.forEach(depId => {
                    const sourceTask = this.props.model.data.find(t => t.id === depId);
                    if (sourceTask) {
                        const sourceIdx = this.props.model.data.indexOf(sourceTask);
                        const targetIdx = index;
                        // Approximate coords for now
                        deps.push({
                            id: `${sourceTask.id}-${task.id}`,
                            x1: 100, y1: sourceIdx * 40 + 20,
                            x2: 150, y2: targetIdx * 40 + 20
                        });
                    }
                });
            }
        });
        return deps;
    }

    updateDependencies() {
        // Real coordinate calculation would go here after layout
    }

    onSetBaseline() { this.env.bus.trigger('SET_BASELINE'); }
    onCriticalPath() { alert("Calculating Critical Path..."); }
    onScroll(ev) { /* Sync sidebars */ }
}
