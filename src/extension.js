const vscode = require('vscode');
const { highlightFeatures, clearHighlights } = require('./highlight');
const { registerHoverProvider } = require('./hover');
const { getAlternatives, openChatbot } = require('./chatbot'); // Add this line

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('🚀 Baseline extension is now active!');

  try {
    // Register hover provider FIRST
    registerHoverProvider(context);

    // Highlight command - FIXED to match package.json
    const highlightDisposable = vscode.commands.registerCommand('baseline-checker.checkFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('Running highlight for:', editor.document.languageId);
        highlightFeatures(editor);
      }
    });

    // Clear highlights command - FIXED to match package.json
    const clearDisposable = vscode.commands.registerCommand('baseline-checker.clearHighlights', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        console.log('Clearing highlights');
        clearHighlights(editor);
      }
    });

    // Get alternatives command (from hover + manual)
    const alternativesDisposable = vscode.commands.registerCommand('baselineChecker.getAlternatives', (args) => {
      console.log('🤖 getAlternatives command called with args:', args);
      try {
        getAlternatives(context, args);
      } catch (error) {
        console.error('Error in getAlternatives:', error);
        vscode.window.showErrorMessage(`Failed to get alternatives: ${error.message}`);
      }
    });

    // Open chatbot command
    const chatDisposable = vscode.commands.registerCommand('baselineChecker.openChat', async () => {
      const feature = await vscode.window.showInputBox({
        prompt: 'Enter the CSS/HTML feature you want help with',
        placeHolder: 'e.g., dialog, grid-template-columns'
      });
      if (feature) openChatbot(context, feature);
    });

    context.subscriptions.push(
      highlightDisposable,
      clearDisposable,
      alternativesDisposable,
      chatDisposable
    );

    // Auto-highlight on file open or text change
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        console.log('Editor changed to:', editor.document.languageId);
        highlightFeatures(editor);
      }
    }, null, context.subscriptions);

    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        setTimeout(() => highlightFeatures(editor), 500);
      }
    }, null, context.subscriptions);

    // Highlight current file on activation
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
 * @description Clean up on extension deactivation
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