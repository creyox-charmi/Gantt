import re

filepath = "c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old_color_dropdown = '''                                            <div t-if="state.colorDropdownOpen" class="position-absolute w-100 bg-white border border-secondary shadow-sm" style="top: 100%; left: 0; z-index: 1060; border-radius: 6px; max-height: 150px; overflow-y: auto;">
                                                <div class="p-2 hover-bg-light d-flex align-items-center" style="cursor: pointer;" t-on-click="() => { state.editorTask.gantt_color = false; state.colorDropdownOpen = false; }">
                                                    <div style="width:14px; height:14px; border-radius:50%; border: 1px solid #ccc; margin-right: 8px; background: white;"></div>
                                                    <span style="font-size: 13px;">No color</span>
                                                </div>
                                                <t t-foreach="['#4285F4','#34A853','#FBBC05','#EA4335','#71639e','#1e293b']" t-as="c" t-key="c">
                                                    <div class="p-2 hover-bg-light d-flex align-items-center" style="cursor: pointer;" t-on-click="() => { state.editorTask.gantt_color = c; state.colorDropdownOpen = false; }">
                                                        <div t-attf-style="width:14px; height:14px; border-radius:50%; background:{{c}}; margin-right: 8px;"></div>
                                                        <span style="font-size: 13px;"><t t-esc="c"/></span>
                                                    </div>
                                                </t>
                                            </div>'''

new_color_dropdown = '''                                            <div t-if="state.colorDropdownOpen" class="position-absolute bg-white border border-secondary shadow-sm" style="top: 100%; right: 0; width: 220px; z-index: 1060; border-radius: 8px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
                                                <t t-foreach="['#ef4444','#ec4899','#d946ef','#a855f7','#8b5cf6','#6366f1','#3b82f6','#0ea5e9','#06b6d4','#14b8a6','#10b981','#22c55e','#84cc16','#eab308','#f59e0b','#f97316','#8b4513','#78716c','#57534e','#44403c','#292524','#1c1917','#000000']" t-as="c" t-key="c">
                                                    <div t-attf-style="width: 24px; height: 24px; border-radius: 6px; background: {{c}}; cursor: pointer; border: 2px solid {{state.editorTask.gantt_color === c ? '#000' : 'transparent'}}; box-shadow: 0 1px 2px rgba(0,0,0,0.1); transition: transform 0.1s;"
                                                         t-on-click="() => { state.editorTask.gantt_color = c; state.colorDropdownOpen = false; }"
                                                         onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"/>
                                                </t>
                                                <div style="width: 24px; height: 24px; border-radius: 6px; cursor: pointer; border: 1px solid #ccc; background: white; display: flex; align-items: center; justify-content: center; position: relative;"
                                                     t-on-click="() => { state.editorTask.gantt_color = false; state.colorDropdownOpen = false; }"
                                                     onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                                                     <div style="position: absolute; width: 140%; height: 1px; background: #ccc; transform: rotate(45deg);"></div>
                                                </div>
                                            </div>'''

# We also need to fix the input box so it just says "No color" if none, and maybe doesn't print the hex code if selected.
old_input_box = '''                                                <div class="d-flex align-items-center">
                                                    <div t-if="state.editorTask.gantt_color" t-attf-style="width:14px; height:14px; border-radius:50%; background:{{state.editorTask.gantt_color}}; margin-right: 8px;"></div>
                                                    <div t-else="" style="width:14px; height:14px; border-radius:50%; border: 1px solid #ccc; margin-right: 8px; background: white;"></div>
                                                    <span class="text-dark" style="font-size: 13px;"><t t-esc="state.editorTask.gantt_color ? state.editorTask.gantt_color : 'No color'"/></span>
                                                </div>'''

new_input_box = '''                                                <div class="d-flex align-items-center">
                                                    <div t-if="state.editorTask.gantt_color" t-attf-style="width:18px; height:18px; border-radius:4px; background:{{state.editorTask.gantt_color}}; margin-right: 8px;"></div>
                                                    <div t-else="" style="width:18px; height:18px; border-radius:4px; border: 1px solid #ccc; margin-right: 8px; background: white; position: relative; overflow: hidden;"><div style="position: absolute; width: 140%; height: 1px; background: #ccc; top: 50%; left: -20%; transform: rotate(45deg);"></div></div>
                                                    <span class="text-dark" style="font-size: 13px;"><t t-esc="state.editorTask.gantt_color ? '' : 'No color'"/></span>
                                                </div>'''

content = content.replace(old_color_dropdown, new_color_dropdown)
content = content.replace(old_input_box, new_input_box)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Color dropdown changed to Bryntum swatch grid!")
