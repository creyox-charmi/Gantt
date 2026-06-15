import re

with open('ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    content = f.read()

# find all static template = xml ... ;
def replace_template(m):
    tpl = m.group(2)
    def replacer(match):
        attr_content = match.group(2)
        attr_content = attr_content.replace('||', ' or ').replace('&&', ' and ').replace('&amp;&amp;', ' and ').replace('===', '==')
        return match.group(1) + attr_content + match.group(3)
    
    tpl = re.sub(r'(t-if=")(.*?)(")', replacer, tpl)
    tpl = re.sub(r'(t-esc=")(.*?)(")', replacer, tpl)
    tpl = re.sub(r'(t-foreach=")(.*?)(")', replacer, tpl)
    tpl = re.sub(r'(t-attf-class=")(.*?)(")', replacer, tpl)
    tpl = re.sub(r'(t-attf-style=")(.*?)(")', replacer, tpl)
    tpl = re.sub(r'(t-att-class=")(.*?)(")', replacer, tpl)
    tpl = re.sub(r'(t-att-style=")(.*?)(")', replacer, tpl)
    return m.group(1) + tpl + m.group(3)

new_content = re.sub(r'(xml)(.*?)(;)', replace_template, content, flags=re.DOTALL)

with open('ultimate_gantt_bundle.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Success")
