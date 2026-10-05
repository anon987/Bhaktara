const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([expoConfig, { ignores: ['dist/**', 'dist-*/**', 'android/**', 'ios/**', 'coverage/**', '.claude/**', 'functions/lib/**', 'admin/dist/**', 'services/*/dist/**'] }]);
