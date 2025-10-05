const vscode = require('vscode');
const { getCssBcdKey, getHtmlBcdKey, getBcdStatus } = require('./highlight');

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
    samsung_internet: 'Samsung',
    webview_android: 'WebView',
    opera_android: 'Opera Android',
    ie: 'IE'
  };
  return names[browser] || browser;
}

function isSupported(version) {
  return version !== false && version != null;
}

function registerHoverProvider(context) {
  const provider = vscode.languages.registerHoverProvider(
    ['css', 'scss', 'less', 'html', 'django-html', 'jinja-html'],
    {
      provideHover(document, position) {
        let wordRange, word, bcdKey, featureType;

        if (['css', 'scss', 'less'].includes(document.languageId)) {
          wordRange = document.getWordRangeAtPosition(position, /[@:]?[\w-]+/);
          if (!wordRange) return null;
          word = document.getText(wordRange);
          bcdKey = getCssBcdKey(word);
          featureType = 'css';
        } else if (document.languageId.includes('html')) {
          wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z][\w-]*/);
          if (!wordRange) return null;
          word = document.getText(wordRange);

          const line = document.lineAt(position.line).text;
          const charPos = position.character;
          let open = line.lastIndexOf('<', charPos);
          let close = line.indexOf('>', charPos);
          if (open === -1 || close === -1 || charPos < open || charPos > close) return null;

          bcdKey = getHtmlBcdKey(word);
          featureType = 'html';
        }

        if (!bcdKey) return null;
        const status = getBcdStatus(bcdKey);
        if (!status) return null;

        try {
          const markdown = new vscode.MarkdownString();
          markdown.isTrusted = true;
          markdown.supportHtml = true;

          // Feature header
          markdown.appendMarkdown(`### \`${word}\`\n\n`);

          // Baseline status - clean and simple
          let baselineText = '';
          if (status.baseline === 'high') {
            baselineText = '**✓ Widely supported**';
          } else if (status.baseline === 'low') {
            baselineText = '**⚡ Newly available**';
          } else {
            baselineText = '**⚠ Limited support**';
          }
          
          if (status.baseline_low_date) {
            const date = new Date(status.baseline_low_date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short' 
            });
            baselineText += ` · Since ${date}`;
          }
          markdown.appendMarkdown(baselineText + '\n\n');

          // Browser support - organized and clean
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
          if (desktopSupported.length > 0) {
            markdown.appendMarkdown(desktopSupported.join(', '));
          }
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
          if (mobileSupported.length > 0) {
            markdown.appendMarkdown(mobileSupported.join(', '));
          }
          if (mobileUnsupported.length > 0) {
            markdown.appendMarkdown(mobileSupported.length > 0 ? ` · ` : '');
            markdown.appendMarkdown(`~~${mobileUnsupported.join(', ')}~~`);
          }
          markdown.appendMarkdown('\n\n');

          // Add alternatives button only if there are actual issues
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

          return new vscode.Hover(markdown, wordRange);
        } catch (err) {
          console.error('Error creating hover:', err);
          return null;
        }
      }
    }
  );

  context.subscriptions.push(provider);
}

module.exports = { registerHoverProvider };