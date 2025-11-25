
// Mock obsidian module
const obsidianMock = {
    normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
};

// We need to mock the require for 'obsidian' before importing Matching
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path: string) {
    if (path === 'obsidian') {
        return obsidianMock;
    }
    return originalRequire.apply(this, arguments);
};

import { isFolderMatch } from './src/Application/Utils/Matching';

const testCases = [
    { folder: 'Lugares/Test', target: 'Lugares/**', expected: true },
    { folder: 'Lugares', target: 'Lugares/**', expected: true },
    { folder: 'LugaresExtra/Test', target: 'Lugares/**', expected: false },
    { folder: 'Lugares', target: 'Lugares', expected: true },
    { folder: 'Lugares/Test', target: 'Lugares', expected: false },
    { folder: 'Other', target: 'Lugares/**', expected: false },
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
