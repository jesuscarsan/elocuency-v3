const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '../../');
const appsDir = path.join(rootDir, 'apps');
const eloConfigPath = path.join(rootDir, 'elo.config.json');

// Get the app name from command line arguments
const appName = process.argv[2];

if (!appName) {
  console.error('Error: Please provide an app name to install.');
  console.log('Usage: npm run install-app <app-name>');
  process.exit(1);
}

if (!fs.existsSync(eloConfigPath)) {
  console.error(`Error: elo.config.json not found at ${eloConfigPath}`);
  process.exit(1);
}

const appsConfig = JSON.parse(fs.readFileSync(eloConfigPath, 'utf8'));
const { availableApps, sourceUrl } = appsConfig;

if (!sourceUrl) {
  console.error('Error: "sourceUrl" is missing in elo.config.json');
  process.exit(1);
}

if (!availableApps || !Array.isArray(availableApps)) {
  console.warn('Warning: "availableApps" is missing or not an array in elo.config.json. Proceeding with provided app name.');
} else {
  // Optional: Check if the requested app is in the allowed list
  // The user didn't explicitly ask for this check, but it's good practice.
  // However, "en base a esto" implies using the structure.
  // I will check if it is in the list, but maybe just warn if not? 
  // Let's strictly follow the existing script's logic which iterates availableApps.
  // If I want to allow installing ANY app from the sourceUrl, I shouldn't restrict it.
  // But if the user says "install-available-apps", it implies a curated list.
  // Let's assume we can install whatever the user asks for, as long as it is a valid git repo at sourceUrl.
  
  // Actually, let's look at the user prompt again. "install-available-apps.js... crea un nuevo script para instalar una unica app que se pasa por parametro."
  // It effectively means "install THIS app", likely from the same source.
  
  if (availableApps.includes(appName)) {
      console.log(`App '${appName}' found in availableApps list.`);
  } else {
      console.log(`Note: '${appName}' is not in the 'availableApps' list in elo.config.json, but will attempt to install from sourceUrl.`);
  }
}

if (!fs.existsSync(appsDir)) {
  console.log(`Creating apps directory at ${appsDir}...`);
  fs.mkdirSync(appsDir, { recursive: true });
}

const appPath = path.join(appsDir, appName);

if (fs.existsSync(appPath)) {
  console.error(`[SKIP] ${appName} already exists at ${appPath}.`);
} else {
  const repoUrl = `${sourceUrl}/${appName}`;
  console.log(`[INSTALL] Cloning ${appName} from ${repoUrl}...`);
  try {
    execSync(`git clone ${repoUrl} ${appPath}`, { stdio: 'inherit' });
    console.log(`[SUCCESS] ${appName} installed successfully.`);
  } catch (error) {
    console.error(`[ERROR] Failed to clone ${appName}:`, error.message);
    process.exit(1);
  }
}
