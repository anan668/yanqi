/* ============================================
   本地 pretext 构建脚本 - build-local-pretext.cjs
   ============================================
   职责：
   1. 为仓库内的 `pretext-main` 找到可用的 TypeScript 运行时。
   2. 把 `src` 目录里的运行时代码转译到 `dist`。
   3. 保留源码注释，方便排查本地文本布局相关问题。
   阅读顺序：
   1. 路径与运行时候选
   2. 构建前清理
   3. 单文件转译
   4. 主入口汇总输出
*/
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const pretextRoot = path.join(projectRoot, 'pretext-main');
const srcDir = path.join(pretextRoot, 'src');
const distDir = path.join(pretextRoot, 'dist');

// 按“环境变量显式指定 -> 项目依赖 -> 本机备用路径”的顺序找 TypeScript 运行时。
const tsRuntimeCandidates = [
  process.env.YANQI_TYPESCRIPT_LIB,
  path.join(projectRoot, 'node_modules', 'typescript', 'lib', 'tsserverlibrary.js'),
  path.join(
    'C:\\Users\\桉桉\\Downloads\\HBuilderX.4.66.2025051912\\HBuilderX\\plugins\\hbuilderx-language-services\\node_modules\\typescript\\lib',
    'tsserverlibrary.js'
  ),
].filter(Boolean);

// 解析可用的 tsserverlibrary.js。
// 这个脚本不直接依赖 `tsc` 命令，而是直接加载 TypeScript runtime 来做转译。
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
      '或者把 typescript 安装到项目的 node_modules 中。',
    ].join(' ')
  );
}

// 只转译真正需要运行的源码文件，排除声明文件、测试文件和演示数据。
function getRuntimeSourceFiles() {
  return fs
    .readdirSync(srcDir)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.d.ts'))
    .filter((name) => !name.endsWith('.test.ts'))
    .filter((name) => name !== 'test-data.ts');
}

// dist 目录每次都整包重建，避免旧文件残留造成误判。
function ensureCleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
}

// 单文件转译流程：读源码 -> 交给 TS runtime -> 汇总诊断 -> 写入 dist。
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

// 主入口只负责串起整个构建链路，并把本次使用的运行时与输出目录打印出来。
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
