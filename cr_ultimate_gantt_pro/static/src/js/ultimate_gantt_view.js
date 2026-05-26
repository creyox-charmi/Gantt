/** @odoo-module **/

import { registry } from "@web/core/registry";
import { UltimateGanttController } from "@cr_ultimate_gantt_pro/js/ultimate_gantt_controller";
import { UltimateGanttModel } from "@cr_ultimate_gantt_pro/js/ultimate_gantt_model";
import { UltimateGanttRenderer } from "@cr_ultimate_gantt_pro/js/ultimate_gantt_renderer";

export const ultimateGanttView = {
    type: "gantt",
    display_name: "Ultimate Gantt",
    icon: "oi oi-view-gantt",
    multiRecord: true,
    Controller: UltimateGanttController,
    Model: UltimateGanttModel,
    Renderer: UltimateGanttRenderer,

    props(genericProps, view) {
        return {
            ...genericProps,
            Model: view.Model,
            Renderer: view.Renderer,
            Controller: view.Controller,
        };
    },
};

registry.category("views").add("ultimate_gantt", ultimateGanttView);
