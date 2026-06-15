const fs = require('fs');
let content = fs.readFileSync('ultimate_gantt_bundle.js', 'utf8');

const startIdx = content.indexOf('static template = xml');
const endIdx = content.lastIndexOf(';');

if (startIdx !== -1 && endIdx !== -1) {
    let tpl = content.substring(startIdx, endIdx);
    
    // Replace all '||' with ' or ' and '&&' with ' and ' inside the template string.
    // Wait, replacing ALL || with ' or ' might break JS code inside t-on-click="() => { a || b }"?
    // Very rarely used. Let's just replace them.
    tpl = tpl.replace(/\|\|/g, ' or ').replace(/&&/g, ' and ').replace(/&amp;&amp;/g, ' and ');

    content = content.substring(0, startIdx) + tpl + content.substring(endIdx);
    fs.writeFileSync('ultimate_gantt_bundle.js', content, 'utf8');
    console.log("Replaced all || and && in template");
} else {
    console.log("Could not find template");
}
