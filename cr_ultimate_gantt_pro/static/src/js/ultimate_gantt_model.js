/** @odoo-module **/

import { Model } from "@web/views/model";

export class UltimateGanttModel extends Model {
    static services = ["rpc"];

    async load(params) {
        this.data = await this.rpc("/web/dataset/call_kw", {
            model: params.resModel,
            method: "search_read",
            args: [[], ["name", "planned_date_begin", "date_deadline", "baseline_start_date", "baseline_end_date", "actual_progress", "planned_progress", "timesheet_progress", "gantt_color", "wbs_number", "depend_on_ids"]],
            kwargs: {
                domain: params.domain || [],
            },
        });
        return this.data;
    }
}
