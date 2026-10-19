// Marker edits preserve every byte outside one unambiguous managed section.
const marker = /<!-- (agent-board|claude-progress-pane):(start|end) -->/g
export const managedFallback = (text: string, content: string | null): string | null => {
  const marks = [...text.matchAll(marker)]
  if ((text.match(/<!--\s*(?:agent-board|claude-progress-pane)\s*:\s*(?:start|end)\b/gi) ?? []).length !== marks.length) return null
  if (marks.length === 0) return content === null ? text : text + (text === '' || text.endsWith('\n') ? '' : '\n') + '<!-- agent-board:start -->\n' + content + '\n<!-- agent-board:end -->\n'
  const first = marks[0]!, last = marks[1]
  if (marks.length !== 2 || first[2] !== 'start' || last?.[2] !== 'end' || first[1] !== last[1]) return null
  if (content !== null) return text
  return text.slice(0, first.index) + text.slice(last.index! + last[0].length)
}

// Numeric literals keep board/progress paths out of shell interpolation on both hosts.
export const codexFallbackCommand = (board: string, progress: string): string => {
  const points = (value: string): string => Array.from(value, one => one.codePointAt(0)).join(',')
  return `node --input-type=commonjs -e "const p=String.fromCodePoint(${points(board)});process.argv.splice(1,0,p);process.argv.push('--codex-report','--agent','codex','--progress-file',String.fromCodePoint(${points(progress)}));import(require('node:url').pathToFileURL(p).href)"`
}
