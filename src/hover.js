const vscode = require('vscode');
const { getCssBcdKey, getHtmlBcdKey, getBcdStatus } = require('./highlight');

function getBrowserIcon(browser) {
  const icons = {
    chrome: '🟢', firefox: '🟠', safari: '🔵', edge: '🔷', opera: '🔴',
    brave: '🦁', samsung_internet: '📱', chrome_android: '🤖',
    firefox_android: '🦊', safari_ios: '📱', webview_android: '🤖',
    opera_android: '🔴', ie: '⚠️'
  };
  return icons[browser.toLowerCase()] || '⚪';
}

function getBrowserName(browser) {
  const names = {
    chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari', edge: 'Edge', opera: 'Opera',
    brave: 'Brave', chrome_android: 'Chrome Android', firefox_android: 'Firefox Android',
    safari_ios: 'Safari iOS', samsung_internet: 'Samsung Internet',
    webview_android: 'WebView Android', opera_android: 'Opera Android', ie: 'Internet Explorer'
  };
  return names[browser] || browser;
}

function getBaselineStatus(baseline) {
  const statuses = {
    high: { icon: '✅', text: 'Widely Available' },
    low: { icon: '🆕', text: 'Newly Available' },
    false: { icon: '⚠️', text: 'Limited Availability' }
  };
  return statuses[baseline] || statuses.false;
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

          markdown.appendMarkdown(`### ${featureType === 'css' ? '🎨' : '🏷️'} \`${word}\`\n`);
          const baselineInfo = getBaselineStatus(status.baseline);
          markdown.appendMarkdown(`**Baseline:** ${baselineInfo.icon} ${baselineInfo.text}\n`);

          if (status.baseline_low_date) {
            const date = new Date(status.baseline_low_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            markdown.appendMarkdown(`*Available since: ${date}*\n`);
          }

          const support = status.support || {};
          const browsers = {
            desktop: ['chrome', 'edge', 'firefox', 'safari', 'opera', 'ie'],
            mobile: ['chrome_android', 'firefox_android', 'safari_ios', 'samsung_internet', 'opera_android']
          };

          ['desktop', 'mobile'].forEach(type => {
            markdown.appendMarkdown(`\n**${type === 'desktop' ? '🖥️ Desktop' : '📱 Mobile'} Browsers:**  \n`);
            browsers[type].forEach(browser => {
              const version = support[browser];
              const icon = getBrowserIcon(browser);
              const name = getBrowserName(browser);
              if (isSupported(version)) {
                const versionText = version === true ? 'All versions' : `${version}+`;
                markdown.appendMarkdown(`${icon} **${name}**: ✅ ${versionText}  \n`);
              } else {
                markdown.appendMarkdown(`${icon} ~~**${name}**~~: ⚠️ Not supported  \n`);
              }
            });
          });

          // Add "Get Alternatives & Polyfills" button if any browser is unsupported
          const unsupportedBrowsers = Object.keys(support).filter(b => !isSupported(support[b]));
          if (status.baseline === 'low' || status.baseline === false || unsupportedBrowsers.length > 0) {
            const args = {
              feature: word,
              type: featureType,
              baseline: status.baseline,
              unsupportedBrowsers
            };
            const commandUri = `command:baselineChecker.getAlternatives?${encodeURIComponent(JSON.stringify(args))}`;
            markdown.appendMarkdown(`[🤖 Get Alternatives ](${commandUri})  \n`);
          }

          markdown.appendMarkdown(`\n*Data from [Browser Compat Data](https://github.com/mdn/browser-compat-data)*`);

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
