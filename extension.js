const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

const PROJECT_NAME = 'itslearning-ui';
const ITSL_PREFIX = '@its-ui/';

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
 * Scans the project root for all package.json files and returns info about each sub-project.
 * @param {string} root - absolute path to the monorepo root
 * @returns {{ packageName: string, hasBuiltScript: boolean }[]}
 */
function getProjects(root) {
	const files = globSync('**/package.json', {
		cwd: root,
		absolute: true,
		nodir: true,
		ignore: ['**/node_modules/**', '**/dist/**'],
	});

	const result = [];

	for (const fileName of files) {
		try {
			const packageData = JSON.parse(fs.readFileSync(fileName, 'utf8'));
			const packageName = packageData.name;
			if (!packageName || !packageName.startsWith(ITSL_PREFIX)) {
				continue;
			}
			result.push({
				packageName,
				hasBuildScript: !!(packageData.scripts && 'build' in packageData.scripts),
			});
		} catch {
			// skip malformed package.json
		}
	}

	return result;
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

	context.subscriptions.push(
		vscode.commands.registerCommand('itsl.buildApp', async function () {
			const root = findProjectRoot();
			if (!root) {
				vscode.window.showErrorMessage('Not inside an itslearning-ui project. Open a folder within the project and try again.');
				return;
			}

			const projects = getProjects(root).filter(p => p.hasBuildScript);
			if (projects.length === 0) {
				vscode.window.showWarningMessage('No buildable projects found in the monorepo.');
				return;
			}

			// Sort alphabetically by short name (without prefix)
			const sorted = projects
				.map(p => ({
					packageName: p.packageName,
					shortName: p.packageName.replace(ITSL_PREFIX, ''),
				}))
				.sort((a, b) => a.shortName.localeCompare(b.shortName));

			// Recent projects (last 3 built)
			const recentKeys = context.workspaceState.get('itsl.recentBuilds', []);
			const recentItems = recentKeys
				.map(name => sorted.find(p => p.packageName === name))
				.filter(Boolean);

			/** @type {vscode.QuickPickItem[]} */
			const items = [];

			if (recentItems.length > 0) {
				items.push({ label: 'Recent', kind: vscode.QuickPickItemKind.Separator });
				for (const p of recentItems) {
					items.push({ label: p.shortName, description: p.packageName });
				}
				items.push({ label: 'All projects', kind: vscode.QuickPickItemKind.Separator });
			}

			for (const p of sorted) {
				items.push({ label: p.shortName, description: p.packageName });
			}

			const picked = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a project to build',
			});
			if (!picked) {
				return; // user cancelled
			}

			const packageName = picked.description;

			// Update recent list (keep last 3, most recent first)
			const updatedRecent = [packageName, ...recentKeys.filter(n => n !== packageName)].slice(0, 3);
			await context.workspaceState.update('itsl.recentBuilds', updatedRecent);

			const terminal = vscode.window.createTerminal({ name: `ITSL: Build ${picked.label}`, cwd: root });
			terminal.show();
			terminal.sendText(`yarn workspace ${packageName} build`);
		})
	);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
