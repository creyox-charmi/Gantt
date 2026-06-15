import re
import os

file_path = 'ultimate_gantt_bundle.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

match = re.search(r'(static template = xml)(.*?)(;)', content, flags=re.DOTALL)
if not match:
    print("Could not find template string.")
    exit(1)

template_str = match.group(2)

def replacer(m):
    attr_content = m.group(2)
    attr_content = attr_content.replace('||', ' or ').replace('&&', ' and ').replace('&amp;&amp;', ' and ').replace('===', '==')
    return m.group(1) + attr_content + m.group(3)

template_str = re.sub(r'(t-if=")(.*?)(")', replacer, template_str)
template_str = re.sub(r'(t-esc=")(.*?)(")', replacer, template_str)
template_str = re.sub(r'(t-foreach=")(.*?)(")', replacer, template_str)
template_str = re.sub(r'(t-attf-class=")(.*?)(")', replacer, template_str)
template_str = re.sub(r'(t-attf-style=")(.*?)(")', replacer, template_str)

new_content = content[:match.start()] + match.group(1) + template_str + match.group(3) + content[match.end():]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Replaced || and && in Owl templates successfully!")
