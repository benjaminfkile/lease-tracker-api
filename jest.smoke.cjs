require('dotenv').config();

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/smoke/**/*.test.ts'],
  testTimeout: 30000,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
};
