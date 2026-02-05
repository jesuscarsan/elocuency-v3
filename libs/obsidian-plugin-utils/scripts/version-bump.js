const fs = require('fs');
const path = require('path');

function bumpVersion(manifestPath, packagePath) {
    console.log('Bumping version...');
    
    // Check if files exist
    if (!fs.existsSync(manifestPath)) {
        console.error(`Manifest file not found at: ${manifestPath}`);
        process.exit(1);
    }
    if (!fs.existsSync(packagePath)) {
        console.error(`Package file not found at: ${packagePath}`);
        process.exit(1);
    }

    try {
        const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const versionParts = content.version.split('.').map(Number);
        versionParts[2] += 1;
        const newVersion = versionParts.join('.');
        content.version = newVersion;
        fs.writeFileSync(manifestPath, JSON.stringify(content, null, 2) + '\n');
        
        // Update package.json to match
        const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        packageContent.version = newVersion;
        fs.writeFileSync(packagePath, JSON.stringify(packageContent, null, 2) + '\n');

        console.log(`Version bumped to ${newVersion}`);
        return newVersion;
    } catch (error) {
        console.error('Error bumping version:', error);
        process.exit(1);
    }
}

// Allow running directly if called as a script
if (require.main === module) {
    const cwd = process.cwd();
    // Default to looking for files in the current working directory
    const manifestPath = process.argv[2] || path.join(cwd, 'manifest.json');
    const packagePath = process.argv[3] || path.join(cwd, 'package.json');
    
    bumpVersion(manifestPath, packagePath);
}

module.exports = { bumpVersion };
