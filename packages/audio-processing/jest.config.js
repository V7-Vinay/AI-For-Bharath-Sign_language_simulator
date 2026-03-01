module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.property.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.property.test.ts'
  ],
  moduleNameMapper: {
    '^@accessibility-ai/types$': '<rootDir>/../types/src/index.ts'
  }
};
