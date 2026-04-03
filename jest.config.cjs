module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['<rootDir>/__tests__/smoke/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
