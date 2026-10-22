import config from './jest.config.js';
export default {
  ...config,
  testMatch: ['<rootDir>/.test-dist/test/integration/**/*.spec.js'],
  testTimeout: 15000,
};
