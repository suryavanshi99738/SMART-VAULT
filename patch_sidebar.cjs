const fs = require('fs');
let code = fs.readFileSync('src/app/layout/Sidebar.tsx', 'utf8');
code = code.replace(/className=\{\`sidebar\$\{collapsed \? " sidebar-collapsed" : ""\}\`\}/, 'className={`sidebar glass${collapsed ? " sidebar-collapsed" : ""}`}');
fs.writeFileSync('src/app/layout/Sidebar.tsx', code);
