/**
 * Jest configuration for B-APP domain tests.
 * Pure TypeScript domain code only — prediction logic is independent from React
 * components (Project Principle #3), so a lightweight ts-jest / node setup is
 * sufficient and fast.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
};
