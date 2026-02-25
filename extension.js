const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const PROJECT_NAME = 'itslearning-ui';

/**
 * Walks up the directory tree from the current workspace folder
 * looking for a package.json with name === "itslearning-ui".
 * @returns {string | undefined} absolute path to the project root, or undefined if not found
 */
function findProjectRoot() {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return undefined;
	}

	let dir = workspaceFolders[0].uri.fsPath;

	// Walk up until we hit the filesystem root
	while (true) {
		const pkgPath = path.join(dir, 'package.json');
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
				if (pkg.name === PROJECT_NAME) {
					return dir;
				}
			} catch {
				// malformed package.json — skip
			}
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			// reached filesystem root without finding the project
			return undefined;
		}
		dir = parent;
	}
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Extension "itsl" is now active.');

	context.subscriptions.push(
		vscode.commands.registerCommand('itsl.check', function () {
			const root = findProjectRoot();
			if (root) {
				vscode.window.showInformationMessage(`itslearning-ui project found at: ${root}`);
			} else {
				vscode.window.showErrorMessage('Not inside an itslearning-ui project. Open a folder within the project and try again.');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('itsl.fastbuild', function () {
			const root = findProjectRoot();
			if (!root) {
				vscode.window.showErrorMessage('Not inside an itslearning-ui project. Open a folder within the project and try again.');
				return;
			}
			const terminal = vscode.window.createTerminal({ name: 'ITSL: Fastbuild', cwd: root });
			terminal.show();
			terminal.sendText('yarn fastbuild:all');
		})
	);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
