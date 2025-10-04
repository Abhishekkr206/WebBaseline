const vscode = require('vscode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

let chatPanel = null;
const API_KEY = 'AIzaSyAEA3HxaPsozbehkgV4jpoKbj3l6L5Ls1Q'; 
let chatHistory = []; // Store context efficiently

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Create chat session with context
 */
async function createChatSession(initialContext) {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { 
      temperature: 0.7, 
      maxOutputTokens: 600 // Reduced for efficiency
    }
  });
  
  // Start with system context
  const session = model.startChat({
    history: initialContext ? [{
      role: 'user',
      parts: [{ text: initialContext }]
    }, {
      role: 'model',
      parts: [{ text: 'I understand. I\'ll provide concise, focused help.' }]
    }] : []
  });
  
  return session;
}

/**
 * Get alternatives from Gemini AI
 */
async function getAlternatives(context, args) {
  if (!args?.feature) {
    vscode.window.showErrorMessage('Invalid feature request');
    return;
  }

  const { feature, type = 'css', baseline = 'low', unsupportedBrowsers = [] } = args;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Analyzing ${feature}...`,
    cancellable: false
  }, async () => {
    try {
      const unsupportedList = unsupportedBrowsers.length ? unsupportedBrowsers.join(', ') : 'None';
      const baselineMap = { high: 'Widely Available', low: 'Newly Available', default: 'Limited' };
      const baselineText = baselineMap[baseline] || baselineMap.default;
      
      // Compact, focused prompt
      const systemContext = `You're a web dev expert. Give SHORT, practical answers only.`;
      
      const prompt = `Feature: "${feature}" (${type.toUpperCase()})
Support: ${baselineText} | Unsupported: ${unsupportedList}

Provide:
1. One-line issue summary
2. Best alternative (specific name/technique)
3. Minimal code example (5-10 lines max)

Format: markdown. Be brief.`;

      // Store context for follow-ups
      chatHistory = [
        { feature, type, baseline: baselineText, unsupported: unsupportedList }
      ];

      const session = await createChatSession(systemContext);
      const result = await session.sendMessage(prompt);
      const text = result.response.text();

      // Save session for follow-ups
      chatHistory.push({ session, initialResponse: text });
      
      showChatPanel(context, feature, type, text);

    } catch (err) {
      vscode.window.showErrorMessage(`Error: ${err.message}`);
      console.error('API Error:', err);
    }
  });
}

/**
 * Open chatbot interface
 */
async function openChatbot(context, featureInput, typeInput) {
  try {
    let feature = featureInput || await vscode.window.showInputBox({
      prompt: 'Enter CSS/HTML feature',
      placeHolder: 'e.g., grid-template-columns'
    });
    
    if (!feature) return;

    let type = typeInput;
    if (!type) {
      const typeChoice = await vscode.window.showQuickPick(['CSS', 'HTML'], {
        placeHolder: 'Feature type?'
      });
      type = typeChoice?.toLowerCase() || 'css';
    }

    await getAlternatives(context, { feature, type });
  } catch (err) {
    vscode.window.showErrorMessage(`Error: ${err.message}`);
    console.error('Chatbot Error:', err);
  }
}

/**
 * Handle follow-up questions with context awareness
 */
async function handleUserQuestion(question) {
  try {
    const session = chatHistory[chatHistory.length - 1]?.session;
    if (!session) throw new Error('No active session');

    // Add context hint for very short questions
    const contextualQuestion = question.length < 15 
      ? `Regarding ${chatHistory[0].feature}: ${question}`
      : question;
    
    const result = await session.sendMessage(contextualQuestion + '\n\nKeep response under 300 words.');
    return result.response.text();
  } catch (err) {
    console.error('Chat Error:', err);
    throw err;
  }
}

/**
 * Convert Markdown to HTML (optimized)
 */
function convertMarkdownToHtml(markdown) {
  if (!markdown) return '';
  
  const codeBlocks = [];
  const inlineCodes = [];
  
  let processed = markdown
    .replace(/```[\s\S]*?```/g, (match) => {
      codeBlocks.push(match);
      return `__CB${codeBlocks.length - 1}__`;
    })
    .replace(/`[^`\n]+`/g, (match) => {
      inlineCodes.push(match);
      return `__IC${inlineCodes.length - 1}__`;
    });
  
  let html = processed
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n/g, '<br>');
  
  html = html.replace(/__CB(\d+)__/g, (_, i) => {
    const match = codeBlocks[i].match(/```(\w+)?\n?([\s\S]*?)```/);
    if (match) {
      const code = match[2].trim();
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    return escapeHtml(codeBlocks[i]);
  });
  
  html = html.replace(/__IC(\d+)__/g, (_, i) => {
    const code = inlineCodes[i].slice(1, -1);
    return `<code>${escapeHtml(code)}</code>`;
  });
  
  return html;
}

/**
 * Show chat panel with response
 */
function showChatPanel(context, feature, type, content) {
  const color = type === 'html' ? '#e74c3c, #c0392b' : '#667eea, #764ba2';
  
  if (!chatPanel) {
    chatPanel = vscode.window.createWebviewPanel(
      'baselineChat',
      `${type.toUpperCase()}: ${feature}`,
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    chatPanel.onDidDispose(() => { 
      chatPanel = null;
      chatHistory = []; // Clear context on close
    });

    chatPanel.webview.onDidReceiveMessage(async message => {
      if (message.command === 'askQuestion') {
        try {
          chatPanel.webview.postMessage({ command: 'showLoading' });
          const response = await handleUserQuestion(message.text);
          chatPanel.webview.postMessage({ 
            command: 'appendContent', 
            question: message.text,
            text: response 
          });
        } catch (err) {
          chatPanel.webview.postMessage({ 
            command: 'showError', 
            text: err.message 
          });
        }
      }
    });
  } else {
    chatPanel.reveal(vscode.ViewColumn.Two);
  }

  chatPanel.title = `${type.toUpperCase()}: ${escapeHtml(feature)}`;
  chatPanel.webview.html = getWebviewContent(feature, type, content, color);
}

/**
 * Generate webview HTML content
 */
function getWebviewContent(feature, type, content, color) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(feature)}</title>
<style>
body { 
  font-family: var(--vscode-font-family); 
  color: var(--vscode-foreground); 
  background-color: var(--vscode-editor-background); 
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  line-height: 1.6;
}
h1, h2, h3 { margin-top: 16px; margin-bottom: 8px; }
pre { 
  background: var(--vscode-textBlockQuote-background); 
  padding: 12px; 
  border-radius: 6px; 
  overflow-x: auto; 
}
code { 
  background: var(--vscode-textBlockQuote-background); 
  padding: 2px 4px; 
  border-radius: 3px; 
}
.header { 
  background: linear-gradient(135deg, ${color}); 
  color: white; 
  padding: 16px; 
  border-radius: 6px; 
  margin-bottom: 16px; 
}
.header h1 { margin: 0; font-size: 1.5em; }
.header .badge {
  background: rgba(255, 255, 255, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  margin-left: 8px;
}
.chat-item {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--vscode-panel-border);
}
.user-question {
  // background: var(--vscode-input-background);
  background: #111111;
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  border-left: 3px solid ${color.split(',')[0]};
}
.input-container {
  padding: 16px;
  border-top: 1px solid var(--vscode-panel-border);
  display: flex;
  gap: 8px;
}
#questionInput {
  flex: 1;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  padding: 10px 12px;
  border-radius: 6px;
}
#askBtn {
  background: linear-gradient(135deg, ${color});
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
}
#askBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.loading { display: none; text-align: center; padding: 20px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div class="content-area">
  <div class="header">
    <h1><code>${escapeHtml(feature)}</code><span class="badge">${type.toUpperCase()}</span></h1>
  </div>
  <div id="content">${convertMarkdownToHtml(content)}</div>
  <div class="loading" id="loading">Thinking...</div>
</div>
<div class="input-container">
  <input type="text" id="questionInput" placeholder="Ask a follow-up question..." />
  <button id="askBtn" onclick="askQuestion()">Ask</button>
</div>

<script>
const vscode = acquireVsCodeApi();

document.getElementById('questionInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') askQuestion();
});

function askQuestion() {
  const input = document.getElementById('questionInput');
  const text = input.value.trim();
  if (!text) return;

  vscode.postMessage({ command: 'askQuestion', text });
  input.value = '';
  input.disabled = true;
  document.getElementById('askBtn').disabled = true;
}

window.addEventListener('message', event => {
  const msg = event.data;
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const input = document.getElementById('questionInput');
  const btn = document.getElementById('askBtn');

  if (msg.command === 'showLoading') {
    loading.style.display = 'block';
  } else if (msg.command === 'appendContent') {
    loading.style.display = 'none';
    const item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = '<div class="user-question"><strong>You:</strong> ' + escapeHtml(msg.question) + '</div>' +
                     '<div>' + convertMarkdown(msg.text) + '</div>';
    content.appendChild(item);
    content.parentElement.scrollTop = content.parentElement.scrollHeight;
    input.disabled = false;
    btn.disabled = false;
    input.focus();
  } else if (msg.command === 'showError') {
    loading.style.display = 'none';
    const item = document.createElement('div');
    item.innerHTML = '<p style="color: var(--vscode-errorForeground);">Error: ' + escapeHtml(msg.text) + '</p>';
    content.appendChild(item);
    input.disabled = false;
    btn.disabled = false;
  }
});

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function convertMarkdown(md) {
  if (!md) return '';
  
  const blocks = [], codes = [];
  let html = md
    .replace(/\`\`\`[\\s\\S]*?\`\`\`/g, m => { blocks.push(m); return \`__B\${blocks.length-1}__\`; })
    .replace(/\`[^\`\\n]+\`/g, m => { codes.push(m); return \`__C\${codes.length-1}__\`; })
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\\n/g, '<br>')
    .replace(/__B(\\d+)__/g, (_, i) => {
      const m = blocks[i].match(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/);
      return m ? \`<pre><code>\${escapeHtml(m[2])}</code></pre>\` : blocks[i];
    })
    .replace(/__C(\\d+)__/g, (_, i) => \`<code>\${escapeHtml(codes[i].slice(1,-1))}</code>\`);
  
  return html;
}
</script>
</body>
</html>`;
}

module.exports = {
  openChatbot,
  getAlternatives
};