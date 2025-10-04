// Imports
const vscode = require("vscode");
const { getStatus } = require("compute-baseline");

// ---------------- Decoration styles ----------------
const decorationTypes = {
  limited: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(239,68,68,0.2)",
    border: "1px solid rgba(239,68,68,0.5)",
    borderRadius: "3px",
  }),
  newly: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(249,115,22,0.2)",
    border: "1px solid rgba(249,115,22,0.5)",
    borderRadius: "3px",
  }),
  widely: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(34,197,94,0.15)",
    border: "1px solid rgba(34,197,94,0.4)",
    borderRadius: "3px",
  }),
};

// ---------------- Helper functions ----------------
function getCssBcdKey(property) {
  return `css.properties.${property}`;
}

function getHtmlBcdKey(element) {
  return `html.elements.${element}`;
}

function getBcdStatus(key) {
  try {
    return getStatus(null, key);
  } catch {
    return null;
  }
}

// ---------------- Push ranges for highlighting ----------------
function pushByStatus(index, length, status, editor, limited, newly, widely) {
  const start = editor.document.positionAt(index);
  const end = editor.document.positionAt(index + length);
  const range = new vscode.Range(start, end);

  if (!status || status.baseline === false) limited.push(range);
  else if (status.baseline === "low") newly.push(range);
  else if (status.baseline === "high") widely.push(range);
}

// ---------------- Highlight CSS properties ----------------
function highlightCss(text, editor, limited, newly, widely) {
  const regex = /([a-zA-Z-]+)\s*:\s*([^;]+);/g;
  let match;

  while ((match = regex.exec(text))) {
    const property = match[1].trim();
    const value = match[2].trim();

    const keys = [`css.properties.${property}`];
    if (value) keys.push(`css.properties.${property}.${value}`);

    keys.forEach((key) => {
      try {
        const status = getStatus(null, key);
        pushByStatus(match.index, property.length, status, editor, limited, newly, widely);
      } catch {}
    });
  }
}

// ---------------- Highlight HTML tags ----------------
function highlightHtml(text, editor, limited, newly, widely) {
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g;
  const checkedTags = new Set();
  let match;

  while ((match = tagRegex.exec(text))) {
    const tagName = match[1].toLowerCase();
    if (checkedTags.has(tagName)) continue;
    checkedTags.add(tagName);

    try {
      const status = getStatus(null, `html.elements.${tagName}`);
      if (!status) continue;

      const allTags = new RegExp(`<\\/?${tagName}(?=[\\s>\/])`, "gi");
      let tagMatch;
      while ((tagMatch = allTags.exec(text))) {
        const startIdx = tagMatch.index + (tagMatch[0].startsWith('</') ? 2 : 1);
        pushByStatus(startIdx, tagName.length, status, editor, limited, newly, widely);
      }
    } catch {}
  }
}

// ---------------- Main function ----------------
function highlightFeatures(editor) {
  if (!editor) return;

  const text = editor.document.getText();
  const language = editor.document.languageId;

  const limited = [];
  const newly = [];
  const widely = [];

  if (["css", "scss", "less"].includes(language)) highlightCss(text, editor, limited, newly, widely);
  if (language.includes("html")) highlightHtml(text, editor, limited, newly, widely);

  editor.setDecorations(decorationTypes.limited, limited);
  editor.setDecorations(decorationTypes.newly, newly);
  editor.setDecorations(decorationTypes.widely, widely);
}

// ---------------- Clear highlights ----------------
function clearHighlights(editor) {
  if (!editor) return;
  editor.setDecorations(decorationTypes.limited, []);
  editor.setDecorations(decorationTypes.newly, []);
  editor.setDecorations(decorationTypes.widely, []);
}

// ---------------- Exports ----------------
module.exports = { 
  highlightFeatures, 
  clearHighlights,
  getCssBcdKey,
  getHtmlBcdKey,
  getBcdStatus
};
