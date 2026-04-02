const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const pretextRoot = path.join(projectRoot, 'pretext-main');
const srcDir = path.join(pretextRoot, 'src');
const distDir = path.join(pretextRoot, 'dist');

const tsRuntimeCandidates = [
  process.env.YANQI_TYPESCRIPT_LIB,
  path.join(projectRoot, 'node_modules', 'typescript', 'lib', 'tsserverlibrary.js'),
  path.join(
    'C:\\Users\\桉桉\\Downloads\\HBuilderX.4.66.2025051912\\HBuilderX\\plugins\\hbuilderx-language-services\\node_modules\\typescript\\lib',
    'tsserverlibrary.js'
  ),
].filter(Boolean);

function resolveTypeScriptRuntime() {
  for (const candidate of tsRuntimeCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      '找不到可用的本地 TypeScript 运行时，无法构建 pretext。',
      '可以设置环境变量 YANQI_TYPESCRIPT_LIB 指向 tsserverlibrary.js，',
      '或者把 typescript 放到项目 node_modules 中。',
    ].join(' ')
  );
}

function getRuntimeSourceFiles() {
  return fs
    .readdirSync(srcDir)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.d.ts'))
    .filter((name) => !name.endsWith('.test.ts'))
    .filter((name) => name !== 'test-data.ts');
}

function ensureCleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
}

function transpileFile(ts, fileName) {
  const sourcePath = path.join(srcDir, fileName);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      newLine: ts.NewLineKind.LineFeed,
      removeComments: false,
      sourceMap: false,
      inlineSourceMap: false,
      declaration: false,
      useDefineForClassFields: false,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });

  if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
    const diagnostics = result.diagnostics
      .map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        const position =
          diagnostic.file && typeof diagnostic.start === 'number'
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
            : null;
        const location = position
          ? `${path.basename(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1}`
          : fileName;
        return `${location} ${message}`;
      })
      .join('\n');

    throw new Error(`pretext 转译失败：\n${diagnostics}`);
  }

  const outPath = path.join(distDir, fileName.replace(/\.ts$/, '.js'));
  fs.writeFileSync(outPath, result.outputText, 'utf8');
}

function main() {
  const runtimePath = resolveTypeScriptRuntime();
  const ts = require(runtimePath);
  const files = getRuntimeSourceFiles();

  ensureCleanDist();

  files.forEach((fileName) => transpileFile(ts, fileName));

  const summary = {
    runtime: runtimePath,
    output: distDir,
    files,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
