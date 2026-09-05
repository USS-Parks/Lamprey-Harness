import pathlib
root = pathlib.Path(__file__).resolve().parents[2]
file = root/'electron/services/database.ts'
text = file.read_text(encoding='utf-8')
start = text.index('/**\n * PS8 — run `fn`')
end = text.index('export function closeDb', start)
assert 'export function transactional<T>' in text[start:end]
file.write_text(text[:start]+text[end:],encoding='utf-8',newline='\n')
print('Removed unused transaction helper and its misleading safety comment.')
