const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', 'dist-*/**', 'android/**', 'ios/**', 'coverage/**', '.claude/**', 'functions/lib/**', 'admin/dist/**', 'services/*/dist/**'] },
  // The admin app resolves "@/…" through its own tsconfig paths (Vite alias);
  // TypeScript checks those imports, so the import plugin skips them.
  { files: ['admin/src/**'], rules: { 'import/no-unresolved': ['error', { ignore: ['^@/'] }] } },
]);
