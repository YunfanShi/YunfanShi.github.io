/* eslint-disable @typescript-eslint/no-require-imports -- Webpack loader API requires CommonJS. */
const ts = require('typescript');
module.exports = function(source) {
  return ts.transpileModule(source, { fileName:this.resourcePath, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText;
};
