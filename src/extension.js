const vscode = require('vscode');
const { highlightFeatures, clearHighlights } = require('./highlight');
const { registerHoverProvider } = require('./hover');
const { getAlternatives, openChatbot } = require('./chatbot');

/**
 * @function activate
 * @description Called when the extension is activated (e.g., VS Code starts or a relevant file is opened)
 * @param {vscode.ExtensionContext} context - VS Code extension context
 */
function activate(context) {
  console.log('🚀 Baseline extension is now active!');

  try {
    // Register hover provider (used to show tooltips for unsupported features)
    registerHoverProvider(context);

    /**
     * Command: Highlight unsupported or special features in the active file
     * Triggered by: "baseline-checker.checkFile"
     */
    const highlightDisposable = vscode.commands.registerCommand('baseline-checker.checkFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('Running highlight for:', editor.document.languageId);
        highlightFeatures(editor);
      }
    });

    /**
     * Command: Clear all highlights from the active file
     * Triggered by: "baseline-checker.clearHighlights"
     */
    const clearDisposable = vscode.commands.registerCommand('baseline-checker.clearHighlights', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('Clearing highlights');
        clearHighlights(editor);
      }
    });

    /**
     * Command: Get feature alternatives (manual trigger or from hover)
     * Triggered by: "baselineChecker.getAlternatives"
     */
    const alternativesDisposable = vscode.commands.registerCommand('baselineChecker.getAlternatives', (args) => {
      console.log('🤖 getAlternatives command called with args:', args);
      try {
        getAlternatives(context, args);
      } catch (error) {
        console.error('Error in getAlternatives:', error);
        vscode.window.showErrorMessage(`Failed to get alternatives: ${error.message}`);
      }
    });

    /**
     * Command: Open chatbot for feature explanation/help
     * Triggered by: "baselineChecker.openChat"
     */
    const chatDisposable = vscode.commands.registerCommand('baselineChecker.openChat', async () => {
      const feature = await vscode.window.showInputBox({
        prompt: 'Enter the CSS/HTML feature you want help with',
        placeHolder: 'e.g., dialog, grid-template-columns'
      });
      if (feature) openChatbot(context, feature);
    });

    // Add all command disposables to context for cleanup
    context.subscriptions.push(
      highlightDisposable,
      clearDisposable,
      alternativesDisposable,
      chatDisposable
    );

    /**
     * Auto-run highlight when:
     * - Active editor changes (user switches files)
     * - File content changes (user types or edits)
     */
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        console.log('Editor changed to:', editor.document.languageId);
        highlightFeatures(editor);
      }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        // Add small delay to avoid excessive re-highlighting
        setTimeout(() => highlightFeatures(editor), 500);
      }
    }, null, context.subscriptions);

    // Run highlight immediately if a file is already open
    const currentEditor = vscode.window.activeTextEditor;
    if (currentEditor) {
      console.log('Initial highlight for:', currentEditor.document.languageId);
      highlightFeatures(currentEditor);
    }

    console.log('✅ Baseline extension fully activated!');
    console.log('Registered commands:', [
      'baseline-checker.checkFile',
      'baseline-checker.clearHighlights',
      'baselineChecker.getAlternatives',
      'baselineChecker.openChat'
    ]);
  } catch (error) {
    console.error('❌ ACTIVATION FAILED:', error);
    vscode.window.showErrorMessage(`Baseline Extension failed to activate: ${error.message}`);
  }
}

/**
 * @function deactivate
 * @description Cleans up highlights and logs when the extension is deactivated
 */
function deactivate() {
  try {
    const editor = vscode.window.activeTextEditor;
    if (editor) clearHighlights(editor);
    console.log('👋 Baseline extension deactivated');
  } catch (error) {
    console.error('Error during deactivation:', error);
  }
}

module.exports = { activate, deactivate };
