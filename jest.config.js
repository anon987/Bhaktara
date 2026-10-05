module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.test.tsx"], // Agent worktrees live under .claude/ and hold full repo copies.
  // admin/ is a separate Vite app with its own dependencies and Vitest suite.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/", "<rootDir>/admin/"],
  modulePathIgnorePatterns: ["<rootDir>/.claude/", "<rootDir>/admin/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/repositories/mockRepository.ts",
    "src/app/navigation/routes.ts",
  ],
};
