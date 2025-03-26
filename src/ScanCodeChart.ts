// This is roughly the scan code chart from the QBasic help file, except that
// the key name uses the JavaScript keyboard event.  When looking up key
// mappings, the specific location is tried first, so Shift_1 matches left
// shift.
//
// All cursor navigation keys are mapped as 101-key "Extended" keys, e.g.
// ArrowLeft is assumed to be the gray ← not the numpad 4 key on a notional
// Model M keyboard.
const chart = `
Escape     1       ║     A            30      ║     CapsLock     58
! or 1     2       ║     S            31      ║     F1           59
@ or 2     3       ║     D            32      ║     F2           60
# or 3     4       ║     F            33      ║     F3           61
$ or 4     5       ║     G            34      ║     F4           62
% or 5     6       ║     H            35      ║     F5           63
^ or 6     7       ║     J            36      ║     F6           64
& or 7     8       ║     K            37      ║     F7           65
* or 8     9       ║     L            38      ║     F8           66
( or 9     10      ║     : or ;       39      ║     F9           67
) or 0     11      ║     " or '       40      ║     F10          68
_ or -     12      ║     ~ or \`      41      ║     F11          87
+ or =     13      ║     Shift_1      42      ║     F12          88
Backspace  14      ║     | or \\      43      ║                  69
Tab        15      ║     Z            44      ║                  70
Q          16      ║     X            45      ║     Home         71
W          17      ║     C            46      ║     ArrowUp      72
E          18      ║     V            47      ║     PgUp         73
R          19      ║     B            48      ║                  74
T          20      ║     N            49      ║     ArrowLeft    75
Y          21      ║     M            50      ║                  76
U          22      ║     < or ,       51      ║     ArrowRight   77
I          23      ║     > or .       52      ║                  78
O          24      ║     ? or /       53      ║     End          79
P          25      ║     Shift_2      54      ║     ArrowDown    80
{ or [     26      ║                  55      ║     PgDn         81
} or ]     27      ║     Alt          56      ║     Insert       82
Enter      28      ║     Spacebar     57      ║     Delete       83
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

export function isExtendedKey(code: number): boolean {
  return code >= 71;
}