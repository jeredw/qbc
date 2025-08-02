// This table is used to translate JavaScript keyboard events into scan codes.
// In the left of each column is the `key` name, and on the right is the
// corresponding integer keyboard scan code.  See
// https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
//
// A suffix like _1 in the key name matches the `location` property when looking
// up keys.  So Shift_1 matches left shift, Shift_2 matches right, *_3 matches
// numpad *, etc.
//
// Many keys share codes and are distinguished by modifiers.  Keys that are mapped
// to the same code have "or" between them.  NumLock doesn't exist in OS X, but
// like most PC emulator software, we treat the Clear key as a software NumLock.
const chart = `
Escape     1       ║     A            30      ║     CapsLock           58
! or 1     2       ║     S            31      ║     F1                 59
@ or 2     3       ║     D            32      ║     F2                 60
# or 3     4       ║     F            33      ║     F3                 61
$ or 4     5       ║     G            34      ║     F4                 62
% or 5     6       ║     H            35      ║     F5                 63
^ or 6     7       ║     J            36      ║     F6                 64
& or 7     8       ║     K            37      ║     F7                 65
* or 8     9       ║     L            38      ║     F8                 66
( or 9     10      ║     : or ;       39      ║     F9                 67
) or 0     11      ║     " or '       40      ║     F10                68
_ or -     12      ║     ~ or \`      41      ║     F11               133
+ or =     13      ║     Shift_1      42      ║     F12               134
Backspace  14      ║     | or \\      43      ║     NumLock or Clear   69
Tab        15      ║     Z            44      ║     ScrollLock         70
Q          16      ║     X            45      ║     Home or 7_3        71
W          17      ║     C            46      ║     ArrowUp or 8_3     72
E          18      ║     V            47      ║     PageUp or 9_3      73
R          19      ║     B            48      ║     -_3                74
T          20      ║     N            49      ║     ArrowLeft or 4_3   75
Y          21      ║     M            50      ║     5_3                76
U          22      ║     < or ,       51      ║     ArrowRight or 6_3  77
I          23      ║     > or .       52      ║     +_3                78
O          24      ║     ? or /       53      ║     End or 1_3         79
P          25      ║     Shift_2      54      ║     ArrowDown or 2_3   80
{ or [     26      ║     *_3          55      ║     PageDown or 3_3    81
} or ]     27      ║     Alt          56      ║     Insert or 0_3      82
Enter      28      ║     Spacebar     57      ║     Delete or ._3      83
Control    29      ║                          ║
`;
export const [keyToScanCode, scanCodeToKey] = (() => {
  const keyToCode: Map<string, number> = new Map();
  const codeToKey: Map<number, string> = new Map();
  for (const line of chart.split('\n')) {
    if (!line) {
      continue;
    }
    const entries = line.split('║');
    for (const entry of entries) {
      const [nameSpec, codeSpec] = entry.trim().split(/ {2,}/);
      const code = parseInt(codeSpec, 10);
      if (!isFinite(code)) {
        continue;
      }
      const names = nameSpec.split(' or ');
      for (const name of names) {
        const key = name === 'Spacebar' ? ' ' : name;
        keyToCode.set(key, code);
        // Include lowercase names to simplify key lookup for unit tests.
        keyToCode.set(key.toLowerCase(), code);
        codeToKey.set(code, key);
      }
    }
  }
  return [keyToCode, codeToKey];
})();

export function isModifier(code: number): boolean {
  return code === 42 || code == 54 || code == 56 || code == 29 || code == 58;
}