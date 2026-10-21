module.exports = function cssBrowserLoader(source) {
  return `const css = ${JSON.stringify(source)}; const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);`;
};
