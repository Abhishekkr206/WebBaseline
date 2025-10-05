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
/**
 * Generate webview HTML content - Simple & Modern
 */
function getWebviewContent(feature, type, content, color) {
  const accent = color.split(',')[0].trim();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(feature)}</title>
<style>
* { 
  box-sizing: border-box; 
  margin: 0; 
  padding: 0; 
}

body { 
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  padding: 20px 24px;
  border-bottom: 2px solid ${accent};
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 6px;
  background: ${accent};
  color: white;
}

.title {
  font-size: 18px;
  font-weight: 500;
  font-family: monospace;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.message {
  margin-bottom: 24px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.question {
  background: ${accent};
  color: white;
  padding: 10px 16px;
  border-radius: 18px;
  display: inline-block;
  margin-bottom: 12px;
  max-width: 80%;
}

.answer {
  line-height: 1.6;
}

.answer h1, .answer h2, .answer h3 {
  margin: 20px 0 10px;
  font-weight: 600;
}

.answer h2 { font-size: 20px; }
.answer h3 { font-size: 16px; }

.answer p {
  margin: 12px 0;
}

.answer pre {
  background: var(--vscode-textBlockQuote-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  margin: 16px 0;
}

.answer code {
  font-family: 'Courier New', monospace;
  font-size: 13px;
}

.answer pre code {
  background: none;
  padding: 0;
}

.answer :not(pre) > code {
  background: var(--vscode-textBlockQuote-background);
  padding: 2px 6px;
  border-radius: 4px;
  color: ${accent};
}

.answer strong {
  font-weight: 600;
}

.answer a {
  color: ${accent};
  text-decoration: none;
}

.answer a:hover {
  text-decoration: underline;
}

.loading {
  display: none;
  text-align: center;
  padding: 20px;
  color: var(--vscode-descriptionForeground);
}

.input-area {
  border-top: 1px solid var(--vscode-panel-border);
  padding: 16px 24px;
  display: flex;
  gap: 10px;
}

#input {
  flex: 1;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

#input:focus {
  border-color: ${accent};
}

#send {
  background: ${accent};
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s;
}

#send:hover:not(:disabled) {
  opacity: 0.85;
}

#send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { 
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 4px;
}
</style>
</head>
<body>

<div class="header">
  <span class="badge">${type.toUpperCase()}</span>
  <span class="title">${escapeHtml(feature)}</span>
</div>

<div class="content" id="content">
  <div class="message">
    <div class="answer">${convertMarkdownToHtml(content)}</div>
  </div>
  <div class="loading" id="loading">Thinking...</div>
</div>

<div class="input-area">
  <input 
    type="text" 
    id="input" 
    placeholder="Ask a question..."
  />
  <button id="send">Send</button>
</div>

<script>
const vscode = acquireVsCodeApi();

document.getElementById('input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') send();
});

document.getElementById('send').addEventListener('click', send);

function send() {
  const input = document.getElementById('input');
  const text = input.value.trim();
  if (!text) return;

  vscode.postMessage({ command: 'askQuestion', text });
  input.value = '';
  input.disabled = true;
  document.getElementById('send').disabled = true;
}

window.addEventListener('message', event => {
  const { command, question, text } = event.data;
  const content = document.getElementById('content');
  const loading = document.getElementById('loading');
  const input = document.getElementById('input');
  const send = document.getElementById('send');

  if (command === 'showLoading') {
    loading.style.display = 'block';
  } 
  else if (command === 'appendContent') {
    loading.style.display = 'none';
    
    const msg = document.createElement('div');
    msg.className = 'message';
    msg.innerHTML = \`
      <div class="question">\${escapeHtml(question)}</div>
      <div class="answer">\${convertMarkdown(text)}</div>
    \`;
    content.appendChild(msg);
    content.scrollTop = content.scrollHeight;
    
    input.disabled = false;
    send.disabled = false;
    input.focus();
  } 
  else if (command === 'showError') {
    loading.style.display = 'none';
    alert('Error: ' + text);
    input.disabled = false;
    send.disabled = false;
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