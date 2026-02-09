const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../');
const appsDir = path.join(rootDir, 'apps');
const appsJsonPath = path.join(rootDir, 'apps.json');

if (!fs.existsSync(appsJsonPath)) {
  console.error(`Error: apps.json not found at ${appsJsonPath}`);
  process.exit(1);
}

const appsConfig = JSON.parse(fs.readFileSync(appsJsonPath, 'utf8'));
const { availableApps, sourceUrl } = appsConfig;

if (!availableApps || !Array.isArray(availableApps)) {
  console.error('Error: "availableApps" is missing or not an array in apps.json');
  process.exit(1);
}

if (!sourceUrl) {
  console.error('Error: "sourceUrl" is missing in apps.json');
  process.exit(1);
}

if (!fs.existsSync(appsDir)) {
  console.log(`Creating apps directory at ${appsDir}...`);
  fs.mkdirSync(appsDir, { recursive: true });
}

console.log(`Checking for available apps in ${appsDir}...`);

availableApps.forEach(appName => {
  const appPath = path.join(appsDir, appName);
  
  if (fs.existsSync(appPath)) {
    console.log(`[SKIP] ${appName} already exists.`);
  } else {
    const repoUrl = `${sourceUrl}/${appName}`; // Assumes sourceUrl doesn't have trailing slash, or git handles double slash
    console.log(`[INSTALL] Cloning ${appName} from ${repoUrl}...`);
    try {
      execSync(`git clone ${repoUrl} ${appPath}`, { stdio: 'inherit' });
      console.log(`[SUCCESS] ${appName} installed successfully.`);
    } catch (error) {
      console.error(`[ERROR] Failed to clone ${appName}:`, error.message);
    }
  }
});

console.log('Done.');
