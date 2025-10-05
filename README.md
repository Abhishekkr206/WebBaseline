# WebBaseline - VS Code Extension

**WebBaseline** highlights HTML and CSS features in your editor, shows their browser support, and provides AI-powered alternatives with code examples via a built-in chatbot.

---

## 🚀 Features

* **Automatic Feature Highlighting**
  Highlights CSS properties and HTML elements in three categories:

  * **Widely supported** (green)
  * **Newly available** (orange)
  * **Limited support** (red)

![Highlight](https://raw.githubusercontent.com/Abhishekkr206/WebBaseline/main/assets/highlight.png)

* **Hover Info**
  Hover over a CSS property or HTML tag to see:

  * Baseline support level
  * Browser compatibility
  * “Get Alternatives” button for AI suggestions

![Hover](https://raw.githubusercontent.com/Abhishekkr206/WebBaseline/main/assets/hover.png)

* **AI Chatbot for Alternatives**

  * Powered by Google Gemini AI
  * Provides concise alternative solutions and minimal code examples
  * Handles follow-up questions with context

![Chatbot](https://raw.githubusercontent.com/Abhishekkr206/WebBaseline/main/assets/chatbot.png)

* **Commands**

  * `Baseline: Check Current File` → Run highlighting manually
  * `Baseline: Clear Highlights` → Remove all highlights
  * `Open Chat` → Ask the chatbot about a feature

---

## 🛠 Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/abhishek-webbaseline.git
```

2. Install dependencies:

```bash
cd abhishek-webbaseline
npm install
```

3. Open in VS Code and press F5 to launch the extension in a new VS Code window.

## Configuration

You can enable/disable feature highlighting in VS Code settings:

```json
"baselineChecker.highlightEnabled": true
```

## Architecture

```text
src/
├─ extension.js   Entry point; activates extension, registers commands
├─ highlight.js   Scans file & highlights CSS/HTML features
├─ hover.js       Shows baseline & browser support on hover
└─ chatbot.js     Connects to Gemini AI & manages chat panel
```
