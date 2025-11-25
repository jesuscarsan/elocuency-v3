
// Mock normalizePath
function normalizePath(path) {
    return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Checks if a given folder path matches a target folder configuration.
 * Supports exact matches and wildcard matches using '/**' suffix.
 */
function isFolderMatch(folderPath, targetFolder) {
    const normalizedFolder = normalizePath(folderPath);
    const normalizedTarget = normalizePath(targetFolder);

    // Check for wildcard match
    if (normalizedTarget.endsWith('/**')) {
        const prefix = normalizedTarget.slice(0, -3); // Remove '/**'
        
        if (normalizedFolder === prefix) {
             return true;
        }

        if (normalizedFolder.startsWith(prefix + '/')) {
            return true;
        }
        
        return false;
    }

    // Exact match
    return normalizedFolder === normalizedTarget;
}

const testCases = [
    { folder: 'Lugares/Test', target: 'Lugares/**', expected: true },
    { folder: 'Lugares', target: 'Lugares/**', expected: true },
    { folder: 'LugaresExtra/Test', target: 'Lugares/**', expected: false },
    { folder: 'Lugares', target: 'Lugares', expected: true },
    { folder: 'Lugares/Test', target: 'Lugares', expected: false },
    { folder: 'Other', target: 'Lugares/**', expected: false },
    { folder: 'A/B/C', target: 'A/**', expected: true },
    { folder: 'A/B/C', target: 'A/B/**', expected: true },
];

let passed = 0;
let failed = 0;

console.log('Running matching tests...');

testCases.forEach(({ folder, target, expected }) => {
    const result = isFolderMatch(folder, target);
    if (result === expected) {
        console.log(`PASS: ${folder} vs ${target} -> ${result}`);
        passed++;
    } else {
        console.error(`FAIL: ${folder} vs ${target} -> ${result} (expected ${expected})`);
        failed++;
    }
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
    process.exit(1);
}
