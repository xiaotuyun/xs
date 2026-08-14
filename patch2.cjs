const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  "const apiURL = localStorage.getItem('ai_novel_studio_cloud_api_url_userdatas') || \n                             (import.meta as any).env.VITE_CLOUD_API_URL || '';",
  "const apiURL = (localStorage.getItem('ai_novel_studio_cloud_api_url_userdatas') || (import.meta as any).env.VITE_CLOUD_API_URL || '').trim();"
);

fs.writeFileSync('src/App.tsx', content);
