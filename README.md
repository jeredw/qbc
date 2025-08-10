# qbc

This repository contains a cleanroom TypeScript implementation of the MS-DOS
QBasic 1.1 language with an interpreter, a test suite, and a web-based IDE and
shell.

- `npm run build` builds an antlr lexer and grammar
- `npm run test` runs automated tests
- `npm run serve` starts a dev server at http://localhost:5500/

# Language

## IDE behavior

QBasic uses a fancy IDE that automatically formats your code as you type, so
it's not clear what lexical rules an independent grammar for QBasic should use.
We could accept only the format the IDE outputs, or we could accept whatever
text the IDE understands as valid input.

However, if you run a saved program from the MS-DOS command-line with
`QBASIC.EXE /RUN`, the IDE will format it before running it.  People may well
have saved unformatted QBasic programs on rotting floppy disks in dank
basements, which `QBASIC.EXE` would still run correctly.

So it seems better to accept whatever the IDE would understand as a valid
program.

### Incremental parsing

QBasic was intended for interactive development on machines where compiling code
was slow - like, go take a coffee break slow.  So it keeps some parse state like
symbols around between program runs.  For example, if you run:

```basic
SUB test
  SHARED foo AS LONG
  foo = 42
END SUB
test
```

and then edit and rerun:

```basic
SUB test
  SHARED foo AS LONG
  foo = 42
END SUB
test
PRINT foo
```

you get "42".  But if you save and reload this program and do a fresh run, you
get a "Duplicate definition" error on `SHARED foo AS LONG`.

The first interactive run defines a global `foo&`, and rerunning prints it.  But
on a fresh run, `PRINT foo` implicitly defines `foo!`, and the `SHARED`
declaration mismatches it (note: the IDE moves the `SUB` _after_ the `PRINT`)!

This implementation doesn't do incremental parsing and tries to match what would
happen in a fresh run with no saved state.

### Is QBasic case-sensitive?

Kind of not really.  The IDE automatically converts keywords to uppercase, and
it converts identifiers and labels to the same case as their first definition.
This implementation matches keywords and identifiers in any case, and ignores
case for labels and variables, so `A$` and `a$` are the same.

## Environment limits

QBasic limits variable name lengths, string lengths, ranges of datatypes, sizes
of arrays, and DOS stuff like path lengths and the number of file handles.  Most
of this is observable through `ON ERROR` so is really part of the language.  For
example,

```basic
ON ERROR GOTO overflow
a% = 32768
PRINT "no overflow"
END
overflow: PRINT "overflow": END
```

should print "overflow".

## Error codes

There are around 60 error codes that can allegedly happen at runtime for various
specific error situations.  We're probably not going to model all of those
exactly.  Here are the supported runtime errors.

```
1       NEXT without FOR             38      Array not defined
2       ✅Syntax error               39      CASE ELSE expected
3       ✅RETURN without GOSUB       40      ✅Variable required
4       ✅Out of DATA                50      ✅FIELD overflow
5       ✅Illegal function call      51      Internal error
6       ✅Overflow                   52      ✅Bad file name or number
7       ✅Out of memory              53      ✅File not found
8       Label not defined            54      ✅Bad file mode
9       ✅Subscript out of range     55      ✅File already open
10      ✅Duplicate definition       56      ✅FIELD statement active
11      ✅Division by zero           57      Device I/O error
12      Illegal in direct mode       58      ✅File already exists
13      ✅Type mismatch              59      ✅Bad record length
14      Out of string space          61      Disk full
16      String formula too complex   62      ✅Input past end of file
17      Cannot continue              63      ✅Bad record number
18      Function not defined         64      ✅Bad file name
19      ✅No RESUME                  67      Too many files
20      ✅RESUME without error       68      Device unavailable
24      Device timeout               69      Communication-buffer overflow
25      Device fault                 70      Permission denied
26      FOR without NEXT             71      Disk not ready
27      Out of paper                 72      Disk-media error
29      WHILE without WEND           73      ✅Advanced feature unavailable
30      WEND without WHILE           74      Rename across disks
33      Duplicate label              75      ✅Path/File access error
35      Subprogram not defined       76      ✅Path not found
37      Argument-count mismatch
```

Some errors like "WHILE without WEND" can happen at compile time, while others
like "out of paper" are fairly unlikely to happen at any time in this
environment.

# Feature status

QBasic doesn't distinguish the core of the language from standard libraries,
but it would be nice to keep the grammar down to a somewhat reasonable size
rather than just having hundreds of rules to match all the possible pre-defined
statements and functions.

Built-in functions don't need any special parsing, and can just be defined by
the runtime... unless they are also keywords used in other contexts, and thus
not valid identifiers, like `TIMER`.

In theory, many statements also shouldn't need special parsing and can be
parsed the same way as CALLs would be.  However some statements can elide
arguments in the middle of their argument list, which isn't supported for user
defined functions.  And some statements have novel argument syntax like ordered
pairs, file handles or keywords as arguments - it's probably easier just to
parse those using baked in rules.

| Feature          | Category    | Parser  | Codegen |
| ---------------- | ----------- | ------- | ------- |
| `ABS`            | Function    | -       | ✅      |
| `ABSOLUTE`       | Keyword     | ✅      | 🚧      |
| `ACCESS`         | Keyword     | ✅      | ⛔      |
| `AND`            | Operator    | ✅      | ✅      |
| `ANY`            | Keyword     | ✅      | ✅      |
| `APPEND`         | Keyword     | ✅      | ✅      |
| `AS`             | Keyword     | ✅      | ✅      |
| `ASC`            | Function    | -       | ✅      |
| `ATN`            | Function    | -       | ✅      |
| `BASE`           | Keyword     | ✅      | ✅      |
| `BEEP`           | Statement   | -       | ✅      |
| `BINARY`         | Keyword     | ✅      | ✅      |
| `BLOAD`          | Statement   | -       | 🚧      |
| `BSAVE`          | Statement   | -       | 🚧      |
| `CALL`           | Statement   | ✅      | ✅      |
| `CALL ABSOLUTE`  | Statement   | ✅      | 🚧      |
| `CASE`           | Keyword     | ✅      | ✅      |
| `CDBL`           | Function    | -       | ✅      |
| `CHAIN`          | Statement   | -       | 🚧      |
| `CHDIR`          | Statement   | -       | ✅      |
| `CHR$`           | Function    | -       | ✅      |
| `CINT`           | Function    | -       | ✅      |
| `CIRCLE`         | Statement   | ✅      | 🚧      |
| `CLEAR`          | Statement   | ✅      | ✅      |
| `CLNG`           | Function    | -       | ✅      |
| `CLOSE`          | Statement   | ✅      | ✅      |
| `CLS`            | Statement   | -       | ✅      |
| `COLOR`          | Statement   | ✅      | ✅      |
| `COM`            | Statement   | ✅      | ✅      |
| `COMMON`         | Statement   | ✅      | 🚧      |
| `CONST`          | Statement   | ✅      | ✅      |
| `COS`            | Function    | -       | ✅      |
| `CSNG`           | Function    | -       | ✅      |
| `CSRLIN`         | Function    | -       | ✅      |
| `CVD`            | Function    | -       | ✅      |
| `CVDMBF`         | Function    | -       | ✅      |
| `CVI`            | Function    | -       | ✅      |
| `CVL`            | Function    | -       | ✅      |
| `CVS`            | Function    | -       | ✅      |
| `CVSMBF`         | Function    | -       | ✅      |
| `DATA`           | Statement   | ✅      | ✅      |
| `DATE$`          | Function    | ✅      | ✅      |
| `DATE$`          | Statement   | ✅      | ✅      |
| `DECLARE`        | Statement   | ✅      | ✅      |
| `DEF FN`         | Statement   | ✅      | ✅      |
| `DEF SEG`        | Statement   | ✅      | ✅      |
| `DEFDBL`         | Statement   | ✅      | ✅      |
| `DEFINT`         | Statement   | ✅      | ✅      |
| `DEFLNG`         | Statement   | ✅      | ✅      |
| `DEFSNG`         | Statement   | ✅      | ✅      |
| `DEFSTR`         | Statement   | ✅      | ✅      |
| `DIM`            | Statement   | ✅      | ✅      |
| `DO`...`LOOP`    | Statement   | ✅      | ✅      |
| `DOUBLE`         | Keyword     | ✅      | ✅      |
| `DRAW`           | Statement   | -       | ✅      |
| `$DYNAMIC`       | Metacommand | ✅      | ✅      |
| `ELSE`           | Keyword     | ✅      | ✅      |
| `ELSEIF`         | Keyword     | ✅      | ✅      |
| `END`            | Statement   | ✅      | ✅      |
| `ENVIRON`        | Statement   | ✅      | 🚧      |
| `ENVIRON$`       | Function    | ✅      | ✅      |
| `EOF`            | Function    | -       | ✅      |
| `EQV`            | Operator    | ✅      | ✅      |
| `ERASE`          | Statement   | ✅      | ✅      |
| `ERDEV`          | Function    | -       | 🚧      |
| `ERDEV$`         | Function    | -       | 🚧      |
| `ERL`            | Function    | -       | ✅      |
| `ERR`            | Function    | -       | ✅      |
| `ERROR`          | Statement   | ✅      | ✅      |
| `EXIT`           | Statement   | ✅      | ✅      |
| `EXP`            | Function    | -       | ✅      |
| `FIELD`          | Statement   | ✅      | ✅      |
| `FILEATTR`       | Function    | -       | ✅      |
| `FILES`          | Statement   | -       | ✅      |
| `FIX`            | Function    | -       | ✅      |
| `FOR`...`NEXT`   | Statement   | ✅      | ✅      |
| `FRE`            | Function    | -       | 🚧      |
| `FREEFILE`       | Function    | -       | ✅      |
| `FUNCTION`       | Statement   | ✅      | ✅      |
| `GET` I/O        | Statement   | ✅      | ✅      |
| `GET` Graphics   | Statement   | ✅      | ✅      |
| `GOSUB`          | Statement   | ✅      | ✅      |
| `GOTO`           | Statement   | ✅      | ✅      |
| `HEX$`           | Function    | -       | ✅      |
| `IF`...`THEN`... | Statement   | ✅      | ✅      |
| `IMP`            | Operator    | ✅      | ✅      |
| `INKEY$`         | Function    | -       | ✅      |
| `INP`            | Function    | -       | 🚧      |
| `INPUT`          | Statement   | ✅      | ✅      |
| `INPUT$`         | Function    | ✅      | ✅      |
| `INSTR`          | Function    | ✅      | ✅      |
| `INT`            | Function    | -       | ✅      |
| `INTEGER`        | Keyword     | ✅      | ✅      |
| `IOCTL`          | Statement   | ✅      | ⛔      |
| `IOCTL$`         | Function    | ✅      | ⛔      |
| `IS`             | Keyword     | ✅      | ✅      |
| `KEY` Assignment | Statement   | ✅      | ✅      |
| `KEY` Event      | Statement   | ✅      | ✅      |
| `KILL`           | Statement   | -       | ✅      |
| `LBOUND`         | Function    | ✅      | ✅      |
| `LCASE$`         | Function    | -       | ✅      |
| `LEFT$`          | Function    | -       | ✅      |
| `LEN`            | Function    | ✅      | ✅      |
| `LET`            | Statement   | ✅      | ✅      |
| `LINE` Graphics  | Statement   | ✅      | ✅      |
| `LINE INPUT`     | Statement   | ✅      | ✅      |
| `LIST`           | Keyword     | ✅      | ✅      |
| `LOC`            | Function    | -       | ✅      |
| `LOCATE`         | Statement   | ✅      | ✅      |
| `LOCK`           | Statement   | ✅      | ⛔      |
| `LOF`            | Function    | -       | ✅      |
| `LOG`            | Function    | -       | ✅      |
| `LONG`           | Keyword     | ✅      | ✅      |
| `LOOP`           | Keyword     | ✅      | ✅      |
| `LPOS`           | Function    | -       | ✅      |
| `LPRINT`         | Statement   | ✅      | ✅      |
| `LPRINT USING`   | Statement   | ✅      | ✅      |
| `LSET`           | Statement   | ✅      | ✅      |
| `LTRIM$`         | Function    | -       | ✅      |
| `MID$`           | Function    | ✅      | ✅      |
| `MID$`           | Statement   | ✅      | ✅      |
| `MKD$`           | Function    | -       | ✅      |
| `MKDIR`          | Statement   | -       | ✅      |
| `MKDMBF$`        | Function    | -       | ✅      |
| `MKI$`           | Function    | -       | ✅      |
| `MKL$`           | Function    | -       | ✅      |
| `MKS$`           | Function    | -       | ✅      |
| `MKSMBF$`        | Function    | -       | ✅      |
| `MOD`            | Operator    | ✅      | ✅      |
| `NAME`           | Statement   | ✅      | ✅      |
| `NEXT`           | Keyword     | ✅      | ✅      |
| `NOT`            | Operator    | ✅      | ✅      |
| `OCT$`           | Function    | -       | ✅      |
| `OFF`            | Keyword     | ✅      | ✅      |
| `ON COM`         | Statement   | ✅      | ✅      |
| `ON ERROR`       | Statement   | ✅      | ✅      |
| `ON`             | Keyword     | ✅      | ✅      |
| `ON KEY`         | Statement   | ✅      | ✅      |
| `ON PEN`         | Statement   | ✅      | ✅      |
| `ON PLAY`        | Statement   | ✅      | ✅      |
| `ON STRIG`       | Statement   | ✅      | ✅      |
| `ON TIMER`       | Statement   | ✅      | ✅      |
| `ON`...`GOSUB`   | Statement   | ✅      | ✅      |
| `ON`...`GOTO`    | Statement   | ✅      | ✅      |
| `OPEN`           | Statement   | ✅      | 🚧      |
| `OPEN COM`       | Statement   | ✅      | 🚧      |
| `OPTION BASE`    | Statement   | ✅      | ✅      |
| `OR`             | Operator    | ✅      | ✅      |
| `OUT`            | Statement   | -       | 🚧      |
| `OUTPUT`         | Keyword     | ✅      | ✅      |
| `PAINT`          | Statement   | ✅      | 🚧      |
| `PALETTE`        | Statement   | ✅      | ✅      |
| `PALETTE USING`  | Statement   | ✅      | ✅      |
| `PCOPY`          | Statement   | -       | ✅      |
| `PEEK`           | Function    | -       | 🚧      |
| `PEN`            | Function    | ✅      | ✅      |
| `PEN`            | Statement   | ✅      | ✅      |
| `PLAY`           | Function    | ✅      | ✅      |
| `PLAY`           | Statement   | ✅      | ✅      |
| `PLAY` Events    | Statement   | ✅      | ✅      |
| `PMAP`           | Function    | -       | ✅      |
| `POINT`          | Function    | -       | ✅      |
| `POKE`           | Statement   | -       | 🚧      |
| `POS`            | Function    | -       | ✅      |
| `PRESET`         | Statement   | ✅      | ✅      |
| `PRINT`          | Statement   | ✅      | ✅      |
| `PRINT USING`    | Statement   | ✅      | ✅      |
| `PSET`           | Statement   | ✅      | ✅      |
| `PUT` I/O        | Statement   | ✅      | ✅      |
| `PUT` Graphics   | Statement   | ✅      | ✅      |
| `RANDOM`         | Keyword     | ✅      | ✅      |
| `RANDOMIZE`      | Statement   | -       | ✅      |
| `READ`           | Statement   | ✅      | ✅      |
| `REDIM`          | Statement   | ✅      | ✅      |
| `REM`            | Statement   | ✅      | ✅      |
| `RESET`          | Statement   | -       | ✅      |
| `RESTORE`        | Statement   | ✅      | ✅      |
| `RESUME`         | Statement   | ✅      | ✅      |
| `RETURN`         | Statement   | ✅      | ✅      |
| `RIGHT$`         | Function    | -       | ✅      |
| `RMDIR`          | Statement   | -       | ✅      |
| `RND`            | Function    | -       | ✅      |
| `RSET`           | Statement   | ✅      | ✅      |
| `RTRIM$`         | Function    | -       | ✅      |
| `RUN`            | Statement   | ✅      | ✅      |
| `SADD`           | Function    | -       | 🚧      |
| `SCREEN`         | Function    | ✅      | ✅      |
| `SCREEN`         | Statement   | ✅      | 🚧      |
| `SEEK`           | Function    | ✅      | ✅      |
| `SEEK`           | Statement   | ✅      | ✅      |
| `SELECT CASE`    | Statement   | ✅      | ✅      |
| `SGN`            | Function    | -       | ✅      |
| `SHARED`         | Statement   | ✅      | ✅      |
| `SHELL`          | Statement   | -       | ⛔      |
| `SIN`            | Function    | -       | ✅      |
| `SINGLE`         | Keyword     | ✅      | ✅      |
| `SLEEP`          | Statement   | -       | ✅      |
| `SOUND`          | Statement   | -       | ✅      |
| `SPACE$`         | Function    | -       | ✅      |
| `SPC`            | Function    | ✅      | ✅      |
| `SQR`            | Function    | -       | ✅      |
| `STATIC`         | Statement   | ✅      | ✅      |
| `$STATIC`        | Metacommand | ✅      | ✅      |
| `STEP`           | Keyword     | ✅      | ✅      |
| `STICK`          | Function    | -       | ✅      |
| `STOP`           | Statement   | ✅      | ✅      |
| `STR$`           | Function    | -       | 🚧      |
| `STRIG`          | Function    | ✅      | ✅      |
| `STRIG`          | Statement   | ✅      | ✅      |
| `STRING`         | Keyword     | ✅      | ✅      |
| `STRING$`        | Function    | -       | ✅      |
| `SUB`            | Statement   | ✅      | ✅      |
| `SWAP`           | Statement   | ✅      | ✅      |
| `SYSTEM`         | Statement   | -       | ✅      |
| `TAB`            | Function    | ✅      | ✅      |
| `TAN`            | Function    | -       | ✅      |
| `THEN`           | Keyword     | ✅      | ✅      |
| `TIME$`          | Function    | ✅      | ✅      |
| `TIME$`          | Statement   | ✅      | ✅      |
| `TIMER`          | Function    | ✅      | ✅      |
| `TIMER`          | Statement   | ✅      | ✅      |
| `TO`             | Keyword     | ✅      | ✅      |
| `TROFF`          | Statement   | -       | ⛔      |
| `TRON`           | Statement   | -       | ⛔      |
| `TYPE`           | Statement   | ✅      | ✅      |
| `UBOUND`         | Function    | ✅      | ✅      |
| `UCASE$`         | Function    | -       | ✅      |
| `UNLOCK`         | Statement   | ✅      | ⛔      |
| `UNTIL`          | Keyword     | ✅      | ✅      |
| `USING`          | Keyword     | ✅      | ✅      |
| `VAL`            | Function    | -       | 🚧      |
| `VARPTR`         | Function    | -       | ✅      |
| `VARPTR$`        | Function    | -       | ✅      |
| `VARSEG`         | Function    | -       | ✅      |
| `VIEW`           | Statement   | ✅      | ✅      |
| `VIEW PRINT`     | Statement   | ✅      | ✅      |
| `WAIT`           | Statement   | -       | ⛔      |
| `WEND`           | Keyword     | ✅      | ✅      |
| `WHILE`...`WEND` | Statement   | ✅      | ✅      |
| `WIDTH`          | Statement   | ✅      | 🚧      |
| `WINDOW`         | Statement   | ✅      | ✅      |
| `WRITE`          | Statement   | ✅      | ✅      |
| `XOR`            | Operator    | ✅      | ✅      |

# Standard library

QBasic has a ton of built-in commands to control your 1980's MS-DOS computer.
These probably don't make much sense for your computer in whatever year you are
reading this.  This means we can't run QBasic programs without emulating a DOS
PC with a fax modem and the entire 1980's phone system.

We'll just have to draw some arbitrary lines and hack around in whatever way
seems most fun.

## Math

Math still works pretty much as it did in the 1980's, so we're good there.

In particular, IEEE 754 floating point is still around, and we even have the
same single- and double-precision types.  Matching QBasic's transcendental math
functions bit for bit doesn't sound especially fun, so we're probably not going
to do that.

## DOS commands

Some libraries for stuff like file I/O could plausibly make sense on a modern
computer, and some are truly DOS specific.  Most interesting programs read data
files, so we support a simple in-memory filesystem and commonly used I/O stuff.

### Really DOS specific

- `SHELL`: call the DOS shell
- `ENVIRON`: manipulate DOS environment variables
- `IOCTL`: DOS driver interop

### Probably generic

- `FILEATTR`: (DOS) file stats
- `CHDIR`, `RMDIR`, `MKDIR`, `FILES`: directories
- `NAME`, `KILL`: file manipulation
- `DATE`, `TIME`: get or set date and time

## I/O commands

- Graphics commands for drawing, printing, inputting text
- `OPEN` (with special files)
- `LPRINT`: Printers
- `KEY`: Keyboard events
- `ON COM`: (Serial) communications port
- `TIMER`: Interval timers
- `PLAY`, `SOUND`, `BEEP`: PC speaker tone and music player
- `INP`, `OUTP`: directly access I/O ports

QBasic has a pretty decent plotting library for CGA/EGA/VGA.  Matching this
pixel for pixel is a challenge but we have to be very close for games to work
right.

## Low-level memory commands

- `CALL ABSOLUTE`: jumps to a machine code subroutine.
- `VARPTR` and `VARSEG`: find variables in memory.
- `PEEK` and `POKE`: examine and change memory.
- `BSAVE` and `BLOAD`: block copies in memory.
- `FRE`: report and control dynamic memory allocation.

We will abuse segments to index a global array of up to 64k pointers.
`VARSEG` or `VARPTR$` makes a new pointer to its argument's value counting up
from segment `&H0001` (segment `&H0000` is reserved for memory-mapped I/O).
`DEF SEG` will select which pointer we want.  Then `PEEK` and `POKE` update the
bits of the selected variable.  This should be enough of a real memory model for
`BSAVE` and `BLOAD` as well as `DRAW` and `PLAY` `X` commands.

# "QBasic as She is Spoke"

Official documentation and sample programs are a good start, but it's way more
interesting to run the real QBasic programs people wrote.  These can reveal
surprising quirks or make you think about the language in a different way.

Validation is currently underway on 11,000 or so programs collected from
archives of BBS's and the early web, mostly unfinished games written by
teenagers in the '90s.  (Surprisingly, a few programs are from the 2000s and
even the 2010s.)

## Kissin cousins

QBasic was related to QuickBasic ("QB45"), PDS, and Visual Basic.  It also
succeeded GW-BASIC and has some legacy support.  You find lots of these files
mixed together in program collections, so the web shell supports loading
GW-BASIC binary files (even encrypted ones!) as well as QB45 binary format
P-code (experimental).  But since QBasic is kind of a cut down QuickBasic, some
programs need minor modification, and some stuff just doesn't work.

## Surprising behavior

### Labels

Lines can have a line number _and_ a textual label.

```basic
10 foo: PRINT "hello world"
20 GOTO foo
```

Line numbers can be decimals.

```basic
1   PRINT "hello world"
1.5 END : REM just kidding
2   GOTO 1
```

### Control flow

Block `IF` statements can have multiple default `ELSE` clauses.  Ditto
`CASE ELSE` in `SELECT CASE`.

```basic
IF condition THEN
  PRINT "yep"
ELSE IF another.condition THEN
  PRINT "uh huh"
ELSE
  PRINT "welp"
ELSE
  PRINT "wait what"
END IF
```

### Misc

- `PRINT USING` isn't a real statement.  `USING` is a particle that can appear
once, anywhere in the `PRINT` argument list.
- `DRAW`, `PLAY`, and `PRINT USING` have a ton of nuanced finicky specific
undocumented parsing behavior.
- `COMMON` was supposed to be for multi-module programs, but is mostly used just
for `COMMON SHARED` as a kind of missing global declaration statement.

## Missing batteries

Lots of early home computer BASICs were tiny and spartan, and you couldn't do
anything interesting without escaping the language by `PEEK`ing and `POKE`ing.
QBasic was not that - it was a big 16-bit language with hundreds of features, a
"batteries included" environment for novices to get stuff done.  But as personal
computing rocketed into the 1990's, QBasic was left behind missing more and more
batteries.

Case in point: almost every mid 90's PC had a mouse, but QBasic has no mouse
API.  It does have passable joystick and light pen support, but nothing for
mice.  I really have no idea why Microsoft language designers bet on light pens
over mice...

So even simple programs have to break through and use low-level memory and I/O
commands to access drivers and hardware directly.  This was mostly done by
copying and pasting snippets of magic code.  In practice to run interesting
programs, we have to support some amount of `CALL ABSOLUTE`, `PEEK`/`POKE` and
`INP`/`OUT` as substitutes for missing batteries.

This project is about language ergonomics and not PC emulation, so we'll take a
kind of permaculture approach here and model as little as necessary.

## QB45 and code re-use

As piracy became more rampant and QBasic became more obsolete, more people got a
hold of the pro tools like QB45.  This opened up support for `$INCLUDE`
directives and linkable code libraries.  A couple popular framework libraries
started circulating like `DIRECTQB` to solve the missing batteries problem.

Is there enough software out there that it's worth supporting some kind of FFI
to model these, or is that not super interesting?

# References

- [QBasic help file](https://scruss.com/qbasic_hlp/T0002.html)
- [Microsoft QuickBASIC: Language Reference](https://www.pcjs.org/documents/books/mspl13/basic/qblang/)
- [Microsoft QuickBASIC: Programming in BASIC](https://www.pcjs.org/documents/books/mspl13/basic/qbprog/)
- [Example programs](https://github.com/InsaneJetman/classic-qbasic)
- Tested against MS-DOS QBasic 1.1
- Tested lots of random programs from the early web
