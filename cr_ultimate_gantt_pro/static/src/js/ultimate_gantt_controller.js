/** @odoo-module **/

import { Component, onWillStart } from "@odoo/owl";
import { Layout } from "@web/search/layout";
import { useService } from "@web/core/utils/hooks";

export class UltimateGanttController extends Component {
    static template = "cr_ultimate_gantt_pro.UltimateGanttController";
    static components = { Layout };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.model = new this.props.Model(this.env, {
            resModel: this.props.resModel,
            domain: this.props.domain,
        });

        onWillStart(async () => {
            await this.model.load(this.props);
        });

        this.env.bus.on('SET_BASELINE', this, async () => {
            const taskIds = this.model.data.map(t => t.id);
            if (taskIds.length) {
                await this.orm.call(this.props.resModel, "action_set_baseline", [taskIds]);
                await this.model.load(this.props);
                this.render();
            }
        });
    }
}
