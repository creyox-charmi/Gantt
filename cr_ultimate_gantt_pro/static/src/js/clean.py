import re

with open('ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
method_regex = re.compile(r'^\s+(?:async\s+)?([a-zA-Z_0-9]+)\s*\(')

# Methods that are corrupted/duplicated
bad_methods = {'ctxIndent', 'ctxOutdent', 'ctxDelete', 'ctxColor', 'ctxSplit'}

for line in lines:
    match = method_regex.match(line)
    if match:
        method_name = match.group(1)
        if method_name in bad_methods:
            skip = True
        else:
            skip = False
            
    if not skip:
        new_lines.append(line)

clean_content = "".join(new_lines)

# Now inject the clean methods right before _buildCopyVals
methods_to_inject = '''
    async ctxIndent() {
        if (!this.state.contextMenu) return;
        const t = this.state.contextMenu.t;
        this.state.contextMenu = null;
        
        const parentId = t.parent_id ? t.parent_id[0] : false;
        const allTasks = this.props.model.allTasksList;
        const siblings = allTasks.filter(x => (x.parent_id ? x.parent_id[0] : false) === parentId).sort((a,b) => a.sequence - b.sequence);
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
            const parentTask = this.props.model.allTasksList.find(x => x.id === parentId);
            if (parentTask) {
                const grandParentId = parentTask.parent_id ? parentTask.parent_id[0] : false;
                const original = { id: t.id, parent_id: parentId };
                const newVals = { parent_id: grandParentId };
                this.pushHistory('update', original, { id: t.id, ...newVals });
                await this.orm.write("project.task", [t.id], newVals);
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
        const newVals = { gantt_color: clr };
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
'''

clean_content = clean_content.replace('    _buildCopyVals(', methods_to_inject + '\\n    _buildCopyVals(')

# Wait, there's another xml template error in line 644 the user originally reported but it seems they might still have it?
# Let's fix that xml amp; issue if it reverted.
clean_content = clean_content.replace('t.children && t.children.length > 0 && !t.is_milestone', 't.children &amp;&amp; t.children.length > 0 &amp;&amp; !t.is_milestone')

with open('ultimate_gantt_bundle.js', 'w', encoding='utf-8') as f:
    f.write(clean_content)
