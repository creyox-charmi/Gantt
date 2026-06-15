from html.parser import HTMLParser

class Tracker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.output = []

    def handle_starttag(self, tag, attrs):
        self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        else:
            self.output.append(f"Mismatch at {self.getpos()[0]}: Expected </{self.stack[-1][0]}> (opened at {self.stack[-1][1]}), got </{tag}>")

parser = Tracker()
with open('c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find("static template = xml`") + len("static template = xml`")
end = content.find("`;\n    static components = { UltimateGanttRenderer,")
if end == -1:
    end = content.find("`;", start)

xml_str = content[start:end].strip()

parser.feed(xml_str)
for o in parser.output[:5]:
    print(o)
if not parser.output:
    print("Parsed successfully!")
