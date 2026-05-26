import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Inject the cycle detection method
cycle_detection_method = """
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
"""

content = content.replace(
    "    async commitCellEdit() {",
    cycle_detection_method + "    async commitCellEdit() {"
)

# 2. Add validation inside commitCellEdit
commit_validation = """
        let writeVals = {};
        if (field === 'depend_on_ids' || field === 'dependent_ids') {
            const arr = Array.isArray(val) ? val.map(Number) : [];
            const isSuccessor = field === 'dependent_ids';
            if (this.hasCycle(id, arr, isSuccessor)) {
                this.env.services.notification.add("Invalid Dependency: This action creates a circular dependency.", { type: "danger" });
                return;
            }
            writeVals[field] = [[6, 0, arr]];
        } else if (field.includes('date')) {"""

content = content.replace(
    """        let writeVals = {};
        if (field === 'depend_on_ids' || field === 'dependent_ids') {
            writeVals[field] = [[6, 0, Array.isArray(val) ? val.map(Number) : []]];
        } else if (field.includes('date')) {""",
    commit_validation
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching cycle detection successful!")
