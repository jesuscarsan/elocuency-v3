const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'manifest.json');
const packagePath = path.join(__dirname, '..', 'package.json');

function bumpVersion(filePath) {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const versionParts = content.version.split('.').map(Number);
    versionParts[2] += 1;
    const newVersion = versionParts.join('.');
    content.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
    return newVersion;
}

try {
    console.log('Bumping version...');
    const newVersionCheck = bumpVersion(manifestPath);
    
    // Update package.json to match
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    packageContent.version = newVersionCheck;
    fs.writeFileSync(packagePath, JSON.stringify(packageContent, null, 2) + '\n');

    console.log(`Version bumped to ${newVersionCheck}`);
} catch (error) {
    console.error('Error bumping version:', error);
    process.exit(1);
}
