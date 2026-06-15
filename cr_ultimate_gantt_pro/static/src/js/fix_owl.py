import re

with open('ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('static template = xml')
end_idx = content.find(';\n', start_idx)

if start_idx != -1 and end_idx != -1:
    tpl = content[start_idx:end_idx]
    
    # Replace || with or, and && with and. 
    # NOTE: doing a blind replace might break arrow functions or conditionals inside t-on-click or {{}} that actually require JS.
    # Actually, inside {{ }} and t-on-click, Owl allows 'or' and 'and'. 
    tpl = tpl.replace('||', 'or').replace('&&', 'and').replace('&amp;&amp;', 'and')
    
    new_content = content[:start_idx] + tpl + content[end_idx:]
    with open('ultimate_gantt_bundle.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")
else:
    print("Could not find delimiters", start_idx, end_idx)
