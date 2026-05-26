import re

with open('ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_ctxSplit = '''
    async ctxSplit() {
        if (!this.state.contextMenu) return;
        const { t, clickDateMs } = this.state.contextMenu;
        this.state.contextMenu = null;
        
        const s = deserializeDateTime(t.planned_date_begin);
        const e = deserializeDateTime(t.date_deadline);
        
        let midPoint;
        if (clickDateMs) {
            midPoint = luxon.DateTime.fromMillis(clickDateMs);
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
            alert("Task is too short to split visually with a gap.");
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
}
'''

content = content.replace("}\n\nexport const ultimateGanttView", new_ctxSplit + "\n\nexport const ultimateGanttView")

with open('ultimate_gantt_bundle.js', 'w', encoding='utf-8') as f:
    f.write(content)
