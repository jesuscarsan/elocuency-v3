/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/src/__mocks__/obsidian.ts',
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__mocks__/**',
    '!src/Infrastructure/Testing/**',
    '!src/main.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
};
