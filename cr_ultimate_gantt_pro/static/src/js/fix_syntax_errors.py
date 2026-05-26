import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the XML includes
content = content.replace(
    '(state.editingCell.val &amp;&amp; state.editingCell.val.includes)(tt.id)',
    '(state.editingCell.val &amp;&amp; state.editingCell.val.includes(tt.id))'
)

# Fix the Javascript includes
content = content.replace(
    'this.(state.editingCell.val &amp;&amp; state.editingCell.val.includes)(id)',
    'this.state.editingCell.val.includes(id)'
)

# And check if there are any other weird things.
# (state.editingCell.val &amp;&amp; state.editingCell.val.length) ? (state.editingCell.val &amp;&amp; state.editingCell.val.length) + ' tasks'
# Wait! In XML, '&&' was converted to '&amp;&amp;'. But I wrote `(state.editingCell.val &amp;&amp; state.editingCell.val.length)`.
# Wait, did the XML parser like this?
# In Odoo, a `t-esc` or `t-if` is evaluated by JS.
# A JS expression inside `t-esc` shouldn't use HTML entities for && directly IF it's in JS context?
# Actually, inside XML attributes (like `t-att-checked="..."` or `t-if="..."`), `&&` MUST be written as `&amp;&amp;`. So that is correct.

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Restored sanity to ultimate_gantt_bundle.js")
