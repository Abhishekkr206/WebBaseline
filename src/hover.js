// ---------------- Imports ----------------
const vscode = require('vscode');
const { getCssBcdKey, getHtmlBcdKey, getBcdStatus } = require('./highlight');

// ---------------- Utility: Browser name mapping ----------------
/**
 * Converts internal browser keys to human-friendly names.
 */
function getBrowserName(browser) {
  const names = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    safari: 'Safari',
    edge: 'Edge',
    opera: 'Opera',
    brave: 'Brave',
    chrome_android: 'Chrome Android',
    firefox_android: 'Firefox Android',
    safari_ios: 'Safari iOS',
    samsung_internet: 'Samsung Internet',
    webview_android: 'WebView',
    opera_android: 'Opera Android',
    ie: 'IE'
  };
  return names[browser] || browser;
}

/**
 * Returns true if the browser version indicates support.
 */
function isSupported(version) {
  return version !== false && version != null;
}

// ---------------- Register Hover Provider ----------------
/**
 * Registers a hover provider for HTML/CSS files.
 * When the user hovers over a feature (tag or property),
 * it shows baseline support info and browser compatibility.
 */
function registerHoverProvider(context) {
  const provider = vscode.languages.registerHoverProvider(
    ['css', 'scss', 'less', 'html', 'django-html', 'jinja-html'],
    {
      /**
       * Main hover function.
       * Detects the feature under the cursor and builds a markdown hover tooltip.
       */
      provideHover(document, position) {
        let wordRange, word, bcdKey, featureType;

        // ---------- CSS / SCSS / LESS ----------
        if (['css', 'scss', 'less'].includes(document.languageId)) {
          // Match CSS property or variable name
          wordRange = document.getWordRangeAtPosition(position, /[@:]?[\w-]+/);
          if (!wordRange) return null;

          word = document.getText(wordRange);
          bcdKey = getCssBcdKey(word);
          featureType = 'css';
        } 
        // ---------- HTML and Template Languages ----------
        else if (document.languageId.includes('html')) {
          wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z][\w-]*/);
          if (!wordRange) return null;

          word = document.getText(wordRange);
          const line = document.lineAt(position.line).text;
          const charPos = position.character;

          // Check if cursor is inside an HTML tag
          let open = line.lastIndexOf('<', charPos);
          let close = line.indexOf('>', charPos);
          if (open === -1 || close === -1 || charPos < open || charPos > close) return null;

          bcdKey = getHtmlBcdKey(word);
          featureType = 'html';
        }

        // ---------- No feature found ----------
        if (!bcdKey) return null;
        const status = getBcdStatus(bcdKey);
        if (!status) return null;

        // ---------- Build hover tooltip ----------
        try {
          const markdown = new vscode.MarkdownString();
          markdown.isTrusted = true;
          markdown.supportHtml = true;

          // Title (Feature name)
          markdown.appendMarkdown(`### \`${word}\`\n\n`);

          // ---------- Baseline status ----------
          let baselineText = '';
          if (status.baseline === 'high') {
            baselineText = '**✓ Widely supported**';
          } else if (status.baseline === 'low') {
            baselineText = '**⚡ Newly available**';
          } else {
            baselineText = '**⚠ Limited support**';
          }

          // Add baseline date if available
          if (status.baseline_low_date) {
            const date = new Date(status.baseline_low_date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short' 
            });
            baselineText += ` · Since ${date}`;
          }
          markdown.appendMarkdown(baselineText + '\n\n');

          // ---------- Browser support section ----------
          const support = status.support || {};
          const browsers = {
            desktop: ['chrome', 'edge', 'firefox', 'safari'],
            mobile: ['chrome_android', 'safari_ios', 'firefox_android', 'samsung_internet']
          };

          const allUnsupported = [];

          // Desktop browsers
          const desktopSupported = [];
          const desktopUnsupported = [];
          browsers.desktop.forEach(browser => {
            const version = support[browser];
            const name = getBrowserName(browser);

            if (isSupported(version)) {
              const versionText = version === true ? '' : ` ${version}+`;
              desktopSupported.push(`${name}${versionText}`);
            } else {
              desktopUnsupported.push(name);
              allUnsupported.push(browser);
            }
          });

          markdown.appendMarkdown(`**Desktop:** `);
          if (desktopSupported.length > 0) markdown.appendMarkdown(desktopSupported.join(', '));
          if (desktopUnsupported.length > 0) {
            markdown.appendMarkdown(desktopSupported.length > 0 ? ` · ` : '');
            markdown.appendMarkdown(`~~${desktopUnsupported.join(', ')}~~`);
          }
          markdown.appendMarkdown('\n\n');

          // Mobile browsers
          const mobileSupported = [];
          const mobileUnsupported = [];
          browsers.mobile.forEach(browser => {
            const version = support[browser];
            const name = getBrowserName(browser);

            if (isSupported(version)) {
              const versionText = version === true ? '' : ` ${version}+`;
              mobileSupported.push(`${name}${versionText}`);
            } else {
              mobileUnsupported.push(name);
              allUnsupported.push(browser);
            }
          });

          markdown.appendMarkdown(`**Mobile:** `);
          if (mobileSupported.length > 0) markdown.appendMarkdown(mobileSupported.join(', '));
          if (mobileUnsupported.length > 0) {
            markdown.appendMarkdown(mobileSupported.length > 0 ? ` · ` : '');
            markdown.appendMarkdown(`~~${mobileUnsupported.join(', ')}~~`);
          }
          markdown.appendMarkdown('\n\n');

          // ---------- Add "Get Alternatives" button ----------
          const hasIssues = status.baseline === 'low' || 
                            status.baseline === false || 
                            allUnsupported.length > 0;

          if (hasIssues) {
            const args = {
              feature: word,
              type: featureType,
              baseline: status.baseline,
              unsupportedBrowsers: allUnsupported
            };
            const commandUri = `command:baselineChecker.getAlternatives?${encodeURIComponent(JSON.stringify(args))}`;
            markdown.appendMarkdown(`[Get Alternatives →](${commandUri})\n\n`);
          }

          // Return the hover tooltip
          return new vscode.Hover(markdown, wordRange);
        } catch (err) {
          console.error('Error creating hover:', err);
          return null;
        }
      }
    }
  );

  // Register provider for cleanup on deactivation
  context.subscriptions.push(provider);
}

// ---------------- Exports ----------------
module.exports = { registerHoverProvider };
