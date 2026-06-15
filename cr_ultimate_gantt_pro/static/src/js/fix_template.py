import re
with open('ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('static template = xml')
end = content.find('`;', start)

if start != -1:
    tpl = content[start:end]
    
    # Use re.sub to fix all occurrences safely
    tpl = re.sub(r'([a-zA-Z0-9_\.]+)\s*\|\|\s*\[\]', r'(\1 ? \1 : [])', tpl)
    tpl = re.sub(r'tt\.wbs_number\s*\|\|\s*tt\.id', r'(tt.wbs_number ? tt.wbs_number : tt.id)', tpl)
    tpl = re.sub(r'state\.hoverTask\.actual_progress\s*\|\|\s*0', r'(state.hoverTask.actual_progress ? state.hoverTask.actual_progress : 0)', tpl)
    tpl = re.sub(r't\.gantt_color\s*\|\|\s*\'#4285F4\'', r"(t.gantt_color ? t.gantt_color : '#4285F4')", tpl)
    
    tpl = tpl.replace('!state.editorTask._succs || state.editorTask._succs.length === 0', '(!state.editorTask._succs ? true : state.editorTask._succs.length === 0)')
    tpl = tpl.replace('!state.config.gantt_hide_critical_path || !tt.isCritical', '(!state.config.gantt_hide_critical_path ? true : !tt.isCritical)')
    tpl = tpl.replace('rt.planned_date_begin || rt.date_start', '(rt.planned_date_begin ? rt.planned_date_begin : rt.date_start)')
    
    tpl = tpl.replace("state.editorTask.constraint_type === 'none' || state.editorTask.constraint_type === 'asap' || state.editorTask.constraint_type === 'alap'", "(state.editorTask.constraint_type === 'none' ? true : (state.editorTask.constraint_type === 'asap' ? true : state.editorTask.constraint_type === 'alap'))")

    tpl = tpl.replace('(!rt.parent_id || rt.parent_id.length === 0)', '(!rt.parent_id ? true : rt.parent_id.length === 0)')
    
    new_content = content[:start] + tpl + content[end:]
    with open('ultimate_gantt_bundle.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Fixed!')
