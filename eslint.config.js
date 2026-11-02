// ESLint runs in `make lint` for no-undef only; formatting is Prettier's job.
import globals from 'globals';

export default [
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: { 'no-undef': 'error' },
  },
];
