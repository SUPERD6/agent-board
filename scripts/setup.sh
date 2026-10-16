#!/usr/bin/env bash
# Settings the plugin cannot make itself, and the move off the old zip install.
# Run once after `claude plugin install project-progress@claude-progress-pane`; safe to re-run.
#   bash setup.sh [--keep-rule]
# What it does, and why: see the comment at the top of setup.ps1. Needs python3.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
claude="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
keep_rule=0
for arg in "$@"; do
  case "$arg" in
    --keep-rule) keep_rule=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

python3 - "$claude" "$here" "$keep_rule" <<'PY'
import json, os, re, shutil, sys

claude, here, keep_rule = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
done = []

def save(path, text):
    if os.path.exists(path):
        shutil.copyfile(path, path + '.bak')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

settings_path = os.path.join(claude, 'settings.json')
settings = {}
if os.path.exists(settings_path):
    with open(settings_path, encoding='utf-8') as f:
        text = f.read()
    if text.strip():
        settings = json.loads(text)
env = settings.setdefault('env', {})
changed = False
if 'CLAUDE_CODE_ENABLE_TODO_TOOLS' not in env:
    env['CLAUDE_CODE_ENABLE_TODO_TOOLS'] = '1'
    changed = True
    done.append('set CLAUDE_CODE_ENABLE_TODO_TOOLS=1')
old_mod = re.compile(r'[\\/]mods[\\/]project-progress[\\/]?$')
if 'CLAUDE_CODE_PLUGIN_DIRS' in env:
    dirs = [d for d in env['CLAUDE_CODE_PLUGIN_DIRS'].split(os.pathsep) if d]
    keep = [d for d in dirs if not old_mod.search(d)]
    if len(keep) != len(dirs):
        if keep:
            env['CLAUDE_CODE_PLUGIN_DIRS'] = os.pathsep.join(keep)
        else:
            del env['CLAUDE_CODE_PLUGIN_DIRS']
        changed = True
        done += ['removed %s from CLAUDE_CODE_PLUGIN_DIRS' % d for d in dirs if old_mod.search(d)]
if changed:
    save(settings_path, json.dumps(settings, indent=2, ensure_ascii=False) + '\n')

md_path = os.path.join(claude, 'CLAUDE.md')
md = ''
if os.path.exists(md_path):
    with open(md_path, encoding='utf-8') as f:
        md = f.read()
block_re = r'<!-- project-progress:start -->.*?<!-- project-progress:end -->'
has_block = re.search(block_re, md, re.S) is not None
if keep_rule:
    with open(os.path.join(here, 'claude-md-rule.md'), encoding='utf-8') as f:
        block = f.read().strip()
    nxt = re.sub(block_re, lambda _: block, md, flags=re.S) if has_block else (md.rstrip() + '\n\n' + block).lstrip()
    nxt = nxt.rstrip() + '\n'
    what = 'wrote the project-progress rule block'
else:
    nxt = re.sub(r'(\r?\n)*' + block_re + r'(\r?\n)*', '\n\n', md, flags=re.S)
    nxt = nxt.lstrip('\r\n').rstrip() + '\n' if nxt.strip() else ''
    what = 'removed the project-progress rule block (the plugin adds it now)'
if nxt != md and (keep_rule or has_block):
    save(md_path, nxt)
    done.append('CLAUDE.md: ' + what)

print('\n'.join('- ' + one for one in done) if done else 'Nothing to change.')
old_dir = os.path.join(claude, 'mods', 'project-progress')
if os.path.isdir(old_dir):
    print('The old install is still at %s; delete it once the plugin works.' % old_dir)
print('Restart Claude Code. The pane opens by itself; /progress reopens it.')
PY
