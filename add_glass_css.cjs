const fs = require('fs');
let code = fs.readFileSync('src/App.css', 'utf8');
if (!code.includes('.glass {')) {
  code += `
/* ── Glassmorphism ───────────────────────────── */
.glass {
  background: rgba(255, 255, 255, var(--glass-opacity, 0.08));
  backdrop-filter: blur(var(--glass-blur, 20px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 20px));
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: background 0.2s ease, backdrop-filter 0.2s ease;
  border-radius: 12px;
}

[data-theme="light"] .glass {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: var(--bg-secondary) !important;
  border: 1px solid var(--border-default) !important;
}
`;
  fs.writeFileSync('src/App.css', code);
  console.log('App.css glass added');
} else {
  console.log('Already has glass class');
}
