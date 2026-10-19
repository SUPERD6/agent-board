// Native command-file syntax is separate from the shell command it contains.
export const boardRun = (path: string): string => {
  if (!path || path.includes('\0')) throw new Error('INVALID_BOARD_PATH')
  if (/^[A-Za-z0-9 ._:/\\-]+$/.test(path)) return `node "${path}"`
  // Only numeric code points enter the shell. This also keeps native !{...},
  // Markdown backticks and Windows %VAR% expansion away from literal path data.
  const points = Array.from(path, char => char.codePointAt(0)).join(',')
  const source = `const p=String.fromCodePoint(${points});process.argv.splice(1,0,p);import(require('node:url').pathToFileURL(p).href)`
  return `node --input-type=commonjs -e "${source}" --`
}

export const geminiBoardCommand = (description: string, prompt: string, run: string): string =>
  `# Written by the Agent Board plugin (/progress connect).\ndescription = ${JSON.stringify(description)}\nprompt = ${JSON.stringify(`${prompt}\n\n!{${run} --serve}\n`)}\n`

export const opencodeBoardCommand = (description: string, prompt: string, run: string): string =>
  `---\ndescription: ${JSON.stringify(description)}\n---\n\n${prompt}\n\n!\`${run} --serve\`\n`

// Hash the same template on every host, including paths escaped by TOML's JSON
// string syntax or encoded for the shell. The placeholder is internal hash data.
export const normalizeCommandPath = (text: string, path: string, placeholder: string): string => {
  const encoded = `String.fromCodePoint(${Array.from(path, char => char.codePointAt(0)).join(',')})`
  return text.split(encoded).join(placeholder).split(JSON.stringify(path).slice(1, -1)).join(placeholder).split(path).join(placeholder)
}
