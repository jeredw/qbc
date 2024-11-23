#!/usr/bin/env python3
import sys
import subprocess
import re
from typing import List

def pretty_print(tree):
  output = []
  depth = 0
  for ch in tree:
    if ch == '(':
      if depth > 0:
        output += ['\n', ' ' * (depth * 2)]
      depth += 1
    elif ch == ')':
      depth -= 1
    output.append(ch)
  return ''.join(output)

def main(argv: List[str]) -> None:
  for test in argv[1:]:
    golden_file_name = f'{test}.golden'
    check_file_name = f'/tmp/{test}.check'
    grun = subprocess.run(
        f'cd build && grun qbasic program -tree ../{test}',
        shell=True,
        capture_output=True,
        encoding='utf-8')
    if grun.stderr:
      print(f'{test} errors\n{grun.stderr}', end='')
      continue
    tree = pretty_print(grun.stdout)
    diff = subprocess.Popen(
        f'diff -du {golden_file_name} -',
        shell=True,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding='utf-8')
    diff_stdout, diff_stderr = diff.communicate(input=tree)
    if not diff_stderr and not diff_stdout:
      print(f'{test} pass')
      continue
    if diff_stderr:
      print(f'{test} missing golden')
      print(f'{tree}')
    elif diff_stdout:
      print(f'{test} diff')
      print(f'{diff_stdout}')
    if input('gild?') in ('Y', 'y', 'yes'):
      with open(golden_file_name, 'w') as golden_file:
        print(tree, end='', file=golden_file)

if __name__ == '__main__':
  main(sys.argv)
