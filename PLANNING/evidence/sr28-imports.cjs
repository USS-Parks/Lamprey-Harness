// Apply TypeScript's RemoveUnused import action only to files in the recorded diagnostics.
const ts = require('typescript')
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const changed = []
for (const project of ['node', 'web']) {
  const configPath = resolve(`tsconfig.${project}.json`)
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
  const files = [...new Set([...readFileSync(`PLANNING/evidence/sr28-unused-${project}.log`, 'utf8').matchAll(/^([^\r\n]+\.tsx?)\(/gm)].map((match) => resolve(match[1])))]
  const service = ts.createLanguageService({
    ...ts.sys,
    getCompilationSettings: () => parsed.options,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '0',
    getScriptSnapshot: (path) => { const text = ts.sys.readFile(path); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text) },
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: ts.getDefaultLibFilePath
  })
  for (const fileName of files) {
    const edits = service.organizeImports({ type: 'file', fileName, mode: ts.OrganizeImportsMode.RemoveUnused }, { ...ts.getDefaultFormatCodeSettings(), indentSize: 2, tabSize: 2, newLineCharacter: '\n', semicolons: ts.SemicolonPreference.Remove }, {})
    for (const edit of edits) {
      let source = readFileSync(edit.fileName, 'utf8')
      for (const change of [...edit.textChanges].sort((a, b) => b.span.start - a.span.start)) source = source.slice(0, change.span.start) + change.newText + source.slice(change.span.start + change.span.length)
      writeFileSync(edit.fileName, source)
      changed.push(edit.fileName)
    }
  }
  service.dispose()
}
console.log(JSON.stringify({ changed }, null, 2))
