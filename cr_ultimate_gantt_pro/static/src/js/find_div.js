const fs = require('fs');
const content = fs.readFileSync('c:/Users/charm/Documents/odoo/odoo-18.0/custom/addons-data/addons/cr_ultimate_gantt_pro/static/src/js/ultimate_gantt_bundle.js', 'utf8');
const lines = content.split('\n');

const startIndex = 735; // 0-indexed (line 736)
const endIndex = 1332; // 0-indexed (line 1333)

const stack = [];

for (let i = startIndex; i <= endIndex; i++) {
    const line = lines[i];
    // Very simple matching for <div> and </div>
    // This isn't perfect but helps visualize
    let match;
    const openRegex = /<div(?=[\s>])/gi;
    while ((match = openRegex.exec(line)) !== null) {
        // Exclude self-closing <div ... />
        const closeIndex = line.indexOf('>', match.index);
        const selfCloseIndex = line.indexOf('/>', match.index);
        if (selfCloseIndex !== -1 && selfCloseIndex === closeIndex - 1) {
            // self-closing
            continue;
        }
        stack.push(`line ${i+1}`);
    }
    
    const closeRegex = /<\/div>/gi;
    while ((match = closeRegex.exec(line)) !== null) {
        if (stack.length > 0) {
            stack.pop();
        } else {
            console.log(`Unmatched </div> at line ${i+1}`);
        }
    }
}

console.log(`Remaining unclosed <div> count: ${stack.length}`);
if (stack.length > 0) {
    console.log(`They were opened at:`);
    for (let s of stack) {
        console.log(s);
    }
}
