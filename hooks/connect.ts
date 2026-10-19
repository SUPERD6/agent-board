import { BOARD_SCRIPT } from './board-script'
import { boardScriptFor } from './connect-pure'
export * from './connect-pure'

export const boardScript = (path: string, lang: string): string => boardScriptFor(path, lang, BOARD_SCRIPT)
