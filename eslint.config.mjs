import tseslint from 'typescript-eslint';
export default [
  {ignores:['**/node_modules/**','**/dist/**','docs/branch-reference/**']},
  {files:['frontend/src/**/*.{ts,tsx}','src/map/TrackingMap.tsx'],languageOptions:{parser:tseslint.parser},rules:{'eqeqeq':['error','always',{null:'ignore'}],'no-unreachable':'error','no-dupe-args':'error','no-duplicate-case':'error','no-constant-binary-expression':'error','no-unsafe-finally':'error'}},
];
