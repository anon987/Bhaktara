module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.test.tsx"], // Agent worktrees live under .claude/ and hold full repo copies.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/"],
  modulePathIgnorePatterns: ["<rootDir>/.claude/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  collectCoverageFrom: [
    "src/domain/**/*.ts",
    "src/repositories/mockRepository.ts",
    "src/app/navigation/routes.ts",
  ],
};
