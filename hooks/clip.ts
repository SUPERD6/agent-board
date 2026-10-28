// How much of a step or a title the page shows on one line (#463). The counts are characters, not
// pixels: the page's style clips the rest to its width with an ellipsis, so these only keep a
// step that holds a whole work log from filling the page, and a button from being as long as it.
export const LINE_ROOM = 80
export const LABEL_ROOM = 36

// The text on one line: every run of spaces, tabs and line breaks (a pasted step can hold
// CRLF) is one space, and what does not fit in `room` characters is replaced by `…`. It counts
// code points, so a Chinese character outside the first plane is never cut in half. Only the
// copy shown is changed; the record keeps the step as it was written. `line` is absent when the
// text already fits in one line, so a page that has no `line` shows the text itself.
export const clipLine = (text: string, room: number): { line?: string } => {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  // Extra spaces alone are not worth a second copy; a line break is, since it cannot be shown in one line.
  if (chars.length <= room && !/[\r\n]/.test(text)) return {}

  return { line: chars.length > room ? `${chars.slice(0, Math.max(1, room - 1)).join('').trimEnd()}…` : flat }
}
