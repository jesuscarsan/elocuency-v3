const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../');
const workspaceMcpsDir = path.join(rootDir, 'workspace', 'mcps');
const workspaceToolsDir = path.join(rootDir, 'workspace', 'langchain', 'tools');
const eloConfigPath = path.join(rootDir, 'elo.config.json');

console.log('--- Synchronizing Workspace (MCPs & Tools) ---');

if (!fs.existsSync(eloConfigPath)) {
	console.error(`Error: elo.config.json not found at ${eloConfigPath}`);
	process.exit(1);
}

const config = JSON.parse(fs.readFileSync(eloConfigPath, 'utf8'));
const { mcps, langchainTools } = config;

// Ensure directories exist
[workspaceMcpsDir, workspaceToolsDir].forEach((dir) => {
	if (!fs.existsSync(dir)) {
		console.log(`Creating directory at ${dir}...`);
		fs.mkdirSync(dir, { recursive: true });
	}
});

function syncRepos(repos, targetDir, label) {
	if (!repos || !Array.isArray(repos) || repos.length === 0) {
		console.log(`No ${label} configured. Skipping.`);
		return;
	}

	repos.forEach((repo) => {
		const { name, url } = repo;

		if (!name || !url) {
			console.warn(`[WARN] Skipping invalid ${label} entry: ${JSON.stringify(repo)}`);
			return;
		}

		const repoPath = path.join(targetDir, name);

		// 1. Clone or Skip
		if (fs.existsSync(repoPath)) {
			console.log(`[SKIP CLONE] ${label} '${name}' already exists at ${repoPath}.`);
		} else {
			console.log(`[CLONE] Cloning ${name} from ${url}...`);
			try {
				execSync(`git clone ${url} ${repoPath}`, { stdio: 'inherit' });
			} catch (error) {
				console.error(`[ERROR] Failed to clone ${name}:`, error.message);
				return;
			}
		}

		// 2. Detect and Install (Optional for tools, required for MCPs)
		process.chdir(repoPath);
		console.log(`[INSTALL] Detecting project type in ${name}...`);

		try {
			// NODE.JS
			if (fs.existsSync('package.json')) {
				console.log(`  > Node.js project detected. Running npm install...`);
				execSync('npm install', { stdio: 'inherit' });

				const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
				if (pkg.scripts && pkg.scripts.build) {
					console.log(`  > Build script found. Running npm run build...`);
					execSync('npm run build', { stdio: 'inherit' });
				}
			}
			// PYTHON
			else if (
				fs.existsSync('requirements.txt') ||
				fs.existsSync('pyproject.toml') ||
				fs.existsSync('setup.py')
			) {
				console.log(`  > Python project detected. Checking for installation method...`);

				if (fs.existsSync('requirements.txt')) {
					console.log(`  > Installing from requirements.txt...`);
					execSync('pip install -r requirements.txt', { stdio: 'inherit' });
				}

				if (fs.existsSync('setup.py') || fs.existsSync('pyproject.toml')) {
					console.log(`  > Installing as editable package...`);
					execSync('pip install -e .', { stdio: 'inherit' });
				}
			} else {
				console.log(`  > No standard project markers found. Skipping install step.`);
			}

			console.log(`[SUCCESS] ${name} (${label}) is ready.`);
		} catch (error) {
			console.error(`[ERROR] Failed to install/build ${name}:`, error.message);
		} finally {
			process.chdir(rootDir);
		}
	});
}

// Sync MCPs
syncRepos(mcps, workspaceMcpsDir, 'MCP');

// Sync LangChain Tools
syncRepos(langchainTools, workspaceToolsDir, 'LangChain Tool');

console.log('--- Workspace Synchronization Complete ---');
