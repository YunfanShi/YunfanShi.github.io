import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { isSyncableStorageKey } from '../src/lib/local-workspace.ts';
import { legacyWorkspaceFieldForKey, legacyWorkspaceRecordId } from '../src/lib/sync/resource-model.ts';

const root = resolve('.');
const sourceRoots = ['src', 'public', 'legacy-pages'];
const included = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html']);
const excluded = new Set(['node_modules', '.next', '.git', '.tools', '.migration-private']);
const scheduleKey = 'jackyun_schedule_control_v1';

async function collectFiles(directory) {
  const files = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return files; }
  for (const entry of entries) {
    if (entry.isDirectory() && !excluded.has(entry.name)) files.push(...await collectFiles(resolve(directory, entry.name)));
    else if (entry.isFile() && included.has(extname(entry.name))) files.push(resolve(directory, entry.name));
  }
  return files;
}

function declarationValue(declaration, constants, checker, depth) {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && declaration.parent.flags & ts.NodeFlags.Const)
    return expressionValue(declaration.initializer, constants, depth + 1, checker);
  if (ts.isPropertyDeclaration(declaration) && declaration.initializer)
    return expressionValue(declaration.initializer, constants, depth + 1, checker);
  return null;
}

function expressionValue(node, constants, depth = 0, checker = null) {
  if (!node || depth > 8) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) {
    const known = constants.get(node.text);
    if (known !== undefined) return known;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = node.expression.getText();
    const known = constants.get(`${owner}.${node.name.text}`);
    if (known !== undefined) return known;
  }
  if (ts.isCallExpression(node)) {
    const name = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : ts.isIdentifier(node.expression) ? node.expression.text : null;
    const known = name ? constants.get(`call:${name}`) : undefined;
    if (known !== undefined) return known;
  }
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map(span => `${expressionValue(span.expression, constants, depth + 1, checker) ?? '\u0000'}${span.literal.text}`).join('');
  }
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    let symbol = checker?.getSymbolAtLocation(node);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const value = symbol?.valueDeclaration ?? symbol?.declarations?.find(declaration => ts.isVariableDeclaration(declaration));
    if (value) return declarationValue(value, constants, checker, depth);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = expressionValue(node.left, constants, depth + 1, checker);
    const right = expressionValue(node.right, constants, depth + 1, checker);
    return `${left ?? '\u0000'}${right ?? '\u0000'}`;
  }
  return null;
}

function collectConstants(sourceFile, checker, seed = new Map()) {
  const constants = new Map(seed);
  const aliases = new Set(['localStorage', 'workspaceStorage']);
  const variableValues = new Map();
  const variableCounts = new Map();
  const propertyValues = new Map();
  const callableReturns = new Map();
  const addProperty = (name, initializer) => {
    if (!name || !initializer) return;
    const value = expressionValue(initializer, constants, 0, checker);
    if (value === null) return;
    const candidates = propertyValues.get(name) ?? new Set();
    candidates.add(value);
    propertyValues.set(name, candidates);
  };
  const returnedExpression = body => {
    if (!body) return null;
    if (!ts.isBlock(body)) return body;
    let expression = null;
    const visitReturn = node => {
      if (ts.isFunctionLike(node) && node !== body) return;
      if (ts.isReturnStatement(node) && node.expression) {
        if (expression) { expression = undefined; return; }
        expression = node.expression;
      }
      ts.forEachChild(node, visitReturn);
    };
    visitReturn(body);
    return expression ?? null;
  };
  const collectProperties = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
          addProperty(`${node.name.text}.${property.name.text}`, property.initializer);
          addProperty(property.name.text, property.initializer);
        }
        if (ts.isMethodDeclaration(property) && property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
          const returned = returnedExpression(property.body);
          if (returned && property.name.text === 'metadataKey') callableReturns.set(property.name.text, returned);
        }
      }
    }
    if (ts.isPropertyDeclaration(node) && node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      addProperty(node.name.text, node.initializer);
      if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        const returned = returnedExpression(node.initializer.body);
        if (returned) callableReturns.set(node.name.text, returned);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'historyKey') {
      const returned = returnedExpression(node.body);
      if (returned) callableReturns.set(node.name.text, returned);
    }
    ts.forEachChild(node, collectProperties);
  };
  collectProperties(sourceFile);
  for (const [name, values] of propertyValues) {
    if (values.size === 1) {
      const [value] = values;
      constants.set(name, value);
      constants.set(`this.${name}`, value);
    }
  }
  for (const [name, returned] of callableReturns) {
    const value = expressionValue(returned, constants, 0, checker);
    if (value !== null) constants.set(`call:${name}`, value);
  }
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = expressionValue(node.initializer, constants, 0, checker);
      variableCounts.set(node.name.text, (variableCounts.get(node.name.text) ?? 0) + 1);
      if (value !== null) {
        const candidates = variableValues.get(node.name.text) ?? new Set();
        candidates.add(value);
        variableValues.set(node.name.text, candidates);
      }
      const initializer = node.initializer.getText(sourceFile);
      if (/\b(?:window\.)?(?:localStorage|workspaceStorage)\b/.test(initializer)) aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const [name, values] of variableValues) {
    if (variableCounts.get(name) === 1 && values.size === 1) constants.set(name, [...values][0]);
  }
  return { constants, aliases };
}

function storageArgumentValue(argument, call, constants, checker) {
  if (ts.isIdentifier(argument)) {
    let scope = call.parent;
    while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
    if (scope) {
      const matches = [];
      const visit = node => {
        if (ts.isFunctionLike(node) && node !== scope) return;
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === argument.text && node.initializer)
          matches.push(node.initializer);
        ts.forEachChild(node, visit);
      };
      visit(scope);
      if (matches.length === 1) return expressionValue(matches[0], constants, 0, checker);
    }
  }
  return expressionValue(argument, constants, 0, checker);
}

function classify(keyPattern, receiver) {
  if (receiver.includes('sessionStorage')) return { owner: 'local-only', field: null, syncable: false };
  if (keyPattern.startsWith('? ')) return { owner: 'unresolved', field: null, syncable: false };
  if (keyPattern.includes('\u0000')) {
    if (keyPattern.startsWith('\u0000')) return { owner: 'unresolved', field: null, syncable: false };
    const sample = keyPattern.replaceAll('\u0000', 'audit-probe');
    if (!isSyncableStorageKey(sample)) return { owner: 'local-only-or-control', field: null, syncable: false };
    const field = /^ielts_\u0000/i.test(keyPattern) ? 'legacyStudyPlan' : legacyWorkspaceFieldForKey(sample);
    return { owner: field ? 'v5-workspace-pattern' : 'unresolved', field, syncable: Boolean(field && legacyWorkspaceRecordId(sample)) };
  }
  if (keyPattern === scheduleKey) return { owner: 'v5-schedule', field: null, syncable: true };
  const syncable = isSyncableStorageKey(keyPattern);
  const field = legacyWorkspaceFieldForKey(keyPattern);
  return { owner: !syncable ? 'local-only-or-control' : field ? 'v5-workspace' : 'unresolved', field, syncable: syncable && Boolean(legacyWorkspaceRecordId(keyPattern)) };
}

export async function scanSyncStorageInventory() {
  const rows = [];
  const indexedDbCalls = [];
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  const parsed = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : null;
  const config = parsed?.config ? ts.parseJsonConfigFileContent(parsed.config, ts.sys, root) : null;
  const program = config ? ts.createProgram(config.fileNames, config.options) : null;
  const checker = program?.getTypeChecker() ?? null;
  const files = (await Promise.all(sourceRoots.map(path => collectFiles(resolve(root, path))))).flat();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const extension = extname(file);
    const kind = extension === '.tsx' ? ts.ScriptKind.TSX : ['.js', '.mjs', '.html'].includes(extension) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const programSource = program?.getSourceFile(file);
    const segments = extension === '.html'
      ? [...text.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => ({ text: match[1], offset: match.index + match[0].indexOf(match[1]) }))
      : [{ text, offset: 0 }];
    const parsedSegments = segments.map(segment => ({ segment, sourceFile: programSource ?? ts.createSourceFile(file, segment.text, ts.ScriptTarget.Latest, true, kind) }));
    const fileConstants = new Map();
    for (const {sourceFile} of parsedSegments) {
      const {constants} = collectConstants(sourceFile, null);
      for (const [name,value] of constants) if (!fileConstants.has(name)) fileConstants.set(name,value);
    }
    for (const {segment,sourceFile} of parsedSegments) {
    const sourceChecker = programSource === sourceFile ? checker : null;
    const { constants, aliases } = collectConstants(sourceFile, sourceChecker, fileConstants);
    const lineOffset = text.slice(0, segment.offset).split('\n').length - 1;
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.arguments[0]) {
        const method = node.expression.name.text;
        const receiver = node.expression.expression.getText(sourceFile);
        if (method === 'open' && /(?:window\.)?indexedDB$/.test(receiver)) {
          const name = expressionValue(node.arguments[0], constants, 0, sourceChecker);
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          indexedDbCalls.push({kind:'database',name:name?.replaceAll('\u0000','${dynamic}')??null,file:relative(root,file).split(sep).join('/'),line:lineOffset+position.line+1});
        } else if (method === 'createObjectStore' && /\bdb$|\bdatabase$|\.result$|indexedDB/i.test(receiver)) {
          const name = expressionValue(node.arguments[0], constants, 0, sourceChecker);
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          indexedDbCalls.push({kind:'store',name:name?.replaceAll('\u0000','${dynamic}')??null,file:relative(root,file).split(sep).join('/'),line:lineOffset+position.line+1});
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ['getItem', 'setItem', 'removeItem'].includes(node.expression.name.text)) {
        const receiver = node.expression.expression.getText(sourceFile);
        const rootName = receiver.split('.').at(-1);
        if ((aliases.has(rootName) || /(?:localStorage|workspaceStorage|sessionStorage)/.test(receiver)) && node.arguments[0]) {
          const value = storageArgumentValue(node.arguments[0], node, constants, sourceChecker);
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const keyPattern = value ?? `? ${node.arguments[0].getText(sourceFile)}`;
          rows.push({
            file: relative(root, file).split(sep).join('/'),
            line: lineOffset + position.line + 1,
            operation: node.expression.name.text,
            receiver,
            key: keyPattern.replaceAll('\u0000', '${dynamic}'),
            ...classify(keyPattern, receiver),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    }
  }
  const unique = [...new Map(rows.map(row => [`${row.file}:${row.line}:${row.operation}:${row.key}`, row])).values()]
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.operation.localeCompare(b.operation));
  const uniqueIndexedDbCalls = [...new Map(indexedDbCalls.map(row => [`${row.kind}:${row.file}:${row.line}:${row.name}`, row])).values()]
    .sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
  return { sourceFiles: files.length, callSites: unique.length, rows: unique, indexedDbCalls:uniqueIndexedDbCalls };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/audit-sync-storage-inventory.mjs')) {
  const inventory = await scanSyncStorageInventory();
  const summary = Object.groupBy(inventory.rows, row => row.owner);
  console.log(JSON.stringify({
    sourceFiles: inventory.sourceFiles,
    callSites: inventory.callSites,
    indexedDbCalls: inventory.indexedDbCalls,
    owners: Object.fromEntries(Object.entries(summary).map(([key, rows]) => [key, rows.length])),
    unresolved: inventory.rows.filter(row => row.owner === 'unresolved'),
    rows: inventory.rows,
  }, null, 2));
}
