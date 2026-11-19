import firebaseSecurityRules from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*'],
  },
  {
    files: ['**/*.rules'],
    plugins: {
      '@firebase/security-rules': firebaseSecurityRules,
    },
    languageOptions: {
      parser: firebaseSecurityRules.parser,
    },
    rules: {
      ...firebaseSecurityRules.configs.recommended.rules,
    },
  },
];
