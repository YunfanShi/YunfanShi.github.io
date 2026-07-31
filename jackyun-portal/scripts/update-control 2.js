const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'Control.html');
let html = fs.readFileSync(filePath, 'utf-8');

// 1. Remove AI CSS section
html = html.replace(
  /\/\* === AI CHAT SIDEBAR .*?\n(?:.*?\n)*?\.ai-toggle-btn\.closed \{ animation: fadeIn 0\.3s; \}\n\s*/s,
  '/* AI chat functionality replaced by Portal global AI FAB */\n'
);

// 2. Remove AI sidebar HTML and toggle button
html = html.replace(
  /<!-- AI Chat Sidebar Panel \(slide-out from right\) -->[\s\S]*?<\/button>\n\s*/s,
  '<!-- AI chat functionality replaced by Portal global AI FAB -->\n'
);

html = html.replace(
  /<!-- AI Toggle Button \(fixed bottom-right\) -->[\s\S]*?<\/button>\n\s*/s,
  ''
);

// 3. Remove AI JS variables
html = html.replace(
  /let aiMessages = \[\];\n\s*let aiLoading = false;\n\s*let aiStreaming = false;\n/s,
  '/* AI state managed by Portal AI */\n'
);

// 4. Remove AI sidebar functions (toggleAiSidebar, clearAiMessages, addAiMessage)
const aiSidebarFuncRegex = /function toggleAiSidebar\(\) \{[\s\S]*?function clearAiMessages\(\) \{[\s\S]*?function addAiMessage\(role, content\) \{[\s\S]*?\}\n\s*/s;
html = html.replace(aiSidebarFuncRegex, '/* AI sidebar UI functions removed */\n');

// 5. Remove AI send/retry/speak/copy functions
const aiChatFuncRegex = /async function handleAiSend\(\) \{[\s\S]*?\n\s*function handleAiKeyDown\(e\) \{[\s\S]*?\n\s*function handleAiRetry\(\) \{[\s\S]*?\n\s*function handleAiSpeak\(btn, content\) \{[\s\S]*?\n\s*function handleAiCopy\(btn, content\) \{[\s\S]*?\}\n\s*/s;
html = html.replace(aiChatFuncRegex, '/* AI chat interaction functions removed */\n');

// 6. Fix particle canvas resize - add resize listener
html = html.replace(
  /canvas\.width = window\.innerWidth;\n\s*canvas\.height = window\.innerHeight;/s,
  'canvas.width = window.innerWidth;\n        canvas.height = window.innerHeight;\n        window._particleResize = function() {\n          canvas.width = window.innerWidth;\n          canvas.height = window.innerHeight;\n        };\n        window.addEventListener("resize", window._particleResize);'
);

// 7. Clean up resize listener when particle ends
html = html.replace(
  /_particleRunning = false;\n\s*canvas\.style\.display = 'none';\n\s*ctx\.clearRect\(0, 0, W, H\);/s,
  '_particleRunning = false;\n        canvas.style.display = "none";\n        ctx.clearRect(0, 0, W, H);\n        window.removeEventListener("resize", window._particleResize);'
);

fs.writeFileSync(filePath, html, 'utf-8');
console.log('Control.html updated successfully. Size:', html.length, 'bytes');