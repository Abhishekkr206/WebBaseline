// ---------------- Imports ----------------
const vscode = require("vscode");
const { getStatus } = require("compute-baseline");

// ---------------- Decoration styles ----------------
// Each decoration type adds a colored background and border for highlighting
const decorationTypes = {
  limited: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(239,68,68,0.2)", // red - unsupported / not baseline
    border: "1px solid rgba(239,68,68,0.5)",
    borderRadius: "3px",
  }),
  newly: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(249,115,22,0.2)", // orange - recently added (low baseline)
    border: "1px solid rgba(249,115,22,0.5)",
    borderRadius: "3px",
  }),
  widely: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(34,197,94,0.15)", // green - widely supported (high baseline)
    border: "1px solid rgba(34,197,94,0.4)",
    borderRadius: "3px",
  }),
};

// ---------------- Helper functions ----------------

/**
 * Build the Baseline key for a CSS property (e.g. css.properties.grid)
 */
function getCssBcdKey(property) {
  return `css.properties.${property}`;
}

/**
 * Build the Baseline key for an HTML element (e.g. html.elements.dialog)
 */
function getHtmlBcdKey(element) {
  return `html.elements.${element}`;
}

/**
 * Safely fetch baseline status for a given key
 * Returns `null` if lookup fails
 */
function getBcdStatus(key) {
  try {
    return getStatus(null, key);
  } catch {
    return null;
  }
}

// ---------------- Push highlight ranges ----------------
/**
 * Adds a text range to the correct highlight array based on baseline status
 */
function pushByStatus(index, length, status, editor, limited, newly, widely) {
  const start = editor.document.positionAt(index);
  const end = editor.document.positionAt(index + length);
  const range = new vscode.Range(start, end);

  if (!status || status.baseline === false) limited.push(range);   // unsupported
  else if (status.baseline === "low") newly.push(range);           // recently supported
  else if (status.baseline === "high") widely.push(range);         // widely supported
}

// ---------------- Highlight CSS properties ----------------
/**
 * Finds and highlights CSS properties in the active editor
 * Uses regex to detect "property: value;" patterns
 */
function highlightCss(text, editor, limited, newly, widely) {
  const regex = /([a-zA-Z-]+)\s*:\s*([^;]+);/g;
  let match;

  while ((match = regex.exec(text))) {
    const property = match[1].trim();
    const value = match[2].trim();

    // Build keys for both property and property+value (if available)
    const keys = [`css.properties.${property}`];
    if (value) keys.push(`css.properties.${property}.${value}`);

    // Check baseline status for each key and highlight accordingly
    keys.forEach((key) => {
      try {
        const status = getStatus(null, key);
        pushByStatus(match.index, property.length, status, editor, limited, newly, widely);
      } catch {}
    });
  }
}

// ---------------- Highlight HTML tags ----------------
/**
 * Finds and highlights HTML tags in the active editor
 */
function highlightHtml(text, editor, limited, newly, widely) {
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)/g;
  const checkedTags = new Set();
  let match;

  while ((match = tagRegex.exec(text))) {
    const tagName = match[1].toLowerCase();
    if (checkedTags.has(tagName)) continue; // Skip already checked tags
    checkedTags.add(tagName);

    try {
      const status = getStatus(null, `html.elements.${tagName}`);
      if (!status) continue;

      // Match all opening and closing tags for the same element
      const allTags = new RegExp(`<\\/?${tagName}(?=[\\s>/])`, "gi");
      let tagMatch;
      while ((tagMatch = allTags.exec(text))) {
        const startIdx = tagMatch.index + (tagMatch[0].startsWith('</') ? 2 : 1);
        pushByStatus(startIdx, tagName.length, status, editor, limited, newly, widely);
      }
    } catch {}
  }
}

// ---------------- Main highlight function ----------------
/**
 * Highlights unsupported or newly supported features in the editor
 * - CSS: highlights properties and values
 * - HTML: highlights tags
 */
function highlightFeatures(editor) {
  if (!editor) return;

  const text = editor.document.getText();
  const language = editor.document.languageId;

  const limited = [];
  const newly = [];
  const widely = [];

  // Handle CSS-like languages
  if (["css", "scss", "less"].includes(language))
    highlightCss(text, editor, limited, newly, widely);

  // Handle HTML files
  if (language.includes("html"))
    highlightHtml(text, editor, limited, newly, widely);

  // Apply decorations
  editor.setDecorations(decorationTypes.limited, limited);
  editor.setDecorations(decorationTypes.newly, newly);
  editor.setDecorations(decorationTypes.widely, widely);
}

// ---------------- Clear highlights ----------------
/**
 * Removes all highlight decorations from the editor
 */
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
