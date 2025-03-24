# qbc

This repository contains a reconstructed grammar and tools for playing with the
MS-DOS QBasic 1.1 language.

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

## TODO: Error codes

There are 70+ error codes for various specific error situations.  We're probably
not going to model all of those exactly.

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
| `ABSOLUTE`       | Keyword     | ✅      | ⛔      |
| `ACCESS`         | Keyword     | ✅      | ⛔      |
| `AND`            | Operator    | ✅      | ✅      |
| `ANY`            | Keyword     | ✅      | 🚧      |
| `APPEND`         | Keyword     | ✅      | ✅      |
| `AS`             | Keyword     | ✅      | ✅      |
| `ASC`            | Function    | -       | ✅      |
| `ATN`            | Function    | -       | ✅      |
| `BASE`           | Keyword     | ✅      | ✅      |
| `BEEP`           | Statement   | -       | ✅      |
| `BINARY`         | Keyword     | ✅      | ✅      |
| `BLOAD`          | Statement   | -       | ⛔      |
| `BSAVE`          | Statement   | -       | ⛔      |
| `CALL`           | Statement   | ✅      | ✅      |
| `CALL ABSOLUTE`  | Statement   | ✅      | ⛔      |
| `CASE`           | Keyword     | ✅      | ✅      |
| `CDBL`           | Function    | -       | ✅      |
| `CHAIN`          | Statement   | -       | ⛔      |
| `CHDIR`          | Statement   | -       | ✅      |
| `CHR$`           | Function    | -       | ✅      |
| `CINT`           | Function    | -       | ✅      |
| `CIRCLE`         | Statement   | ✅      | ⛔      |
| `CLEAR`          | Statement   | ✅      | ⛔      |
| `CLNG`           | Function    | -       | ✅      |
| `CLOSE`          | Statement   | ✅      | ✅      |
| `CLS`            | Statement   | -       | ⛔      |
| `COLOR`          | Statement   | ✅      | ⛔      |
| `COM`            | Statement   | ✅      | ⛔      |
| `COMMON`         | Statement   | ✅      | ⛔      |
| `CONST`          | Statement   | ✅      | ✅      |
| `COS`            | Function    | -       | ✅      |
| `CSNG`           | Function    | -       | ✅      |
| `CSRLIN`         | Function    | -       | ⛔      |
| `CVD`            | Function    | -       | ✅      |
| `CVDMBF`         | Function    | -       | ✅      |
| `CVI`            | Function    | -       | ✅      |
| `CVL`            | Function    | -       | ✅      |
| `CVS`            | Function    | -       | ✅      |
| `CVSMBF`         | Function    | -       | ✅      |
| `DATA`           | Statement   | ✅      | ✅      |
| `DATE$`          | Function    | ✅      | ✅      |
| `DATE$`          | Statement   | ✅      | ✅      |
| `DECLARE`        | Statement   | ✅      | ⛔      |
| `DEF FN`         | Statement   | ✅      | ✅      |
| `DEF SEG`        | Statement   | ✅      | ⛔      |
| `DEFDBL`         | Statement   | ✅      | ✅      |
| `DEFINT`         | Statement   | ✅      | ✅      |
| `DEFLNG`         | Statement   | ✅      | ✅      |
| `DEFSNG`         | Statement   | ✅      | ✅      |
| `DEFSTR`         | Statement   | ✅      | ✅      |
| `DIM`            | Statement   | ✅      | ✅      |
| `DO`...`LOOP`    | Statement   | ✅      | ✅      |
| `DOUBLE`         | Keyword     | ✅      | ✅      |
| `DRAW`           | Statement   | -       | ⛔      |
| `$DYNAMIC`       | Metacommand | ✅      | ✅      |
| `ELSE`           | Keyword     | ✅      | ✅      |
| `ELSEIF`         | Keyword     | ✅      | ✅      |
| `END`            | Statement   | ✅      | ✅      |
| `ENVIRON`        | Statement   | -       | ⛔      |
| `ENVIRON$`       | Function    | -       | ⛔      |
| `EOF`            | Function    | -       | ✅      |
| `EQV`            | Operator    | ✅      | ✅      |
| `ERASE`          | Statement   | ✅      | ⛔      |
| `ERDEV`          | Function    | -       | ⛔      |
| `ERDEV$`         | Function    | -       | ⛔      |
| `ERL`            | Function    | -       | ⛔      |
| `ERR`            | Function    | -       | ⛔      |
| `ERROR`          | Statement   | ✅      | ⛔      |
| `EXIT`           | Statement   | ✅      | ✅      |
| `EXP`            | Function    | -       | ✅      |
| `FIELD`          | Statement   | ✅      | ⛔      |
| `FILEATTR`       | Function    | -       | ✅      |
| `FILES`          | Statement   | -       | ✅      |
| `FIX`            | Function    | -       | ✅      |
| `FOR`...`NEXT`   | Statement   | ✅      | ✅      |
| `FRE`            | Function    | -       | ⛔      |
| `FREEFILE`       | Function    | -       | ✅      |
| `FUNCTION`       | Statement   | ✅      | ✅      |
| `GET` I/O        | Statement   | ✅      | ⛔      |
| `GET` Graphics   | Statement   | ✅      | ⛔      |
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
| `KEY` Assignment | Statement   | ✅      | ⛔      |
| `KEY` Event      | Statement   | ✅      | ⛔      |
| `KILL`           | Statement   | -       | ✅      |
| `LBOUND`         | Function    | ✅      | ✅      |
| `LCASE$`         | Function    | -       | ✅      |
| `LEFT$`          | Function    | -       | ✅      |
| `LEN`            | Function    | ✅      | ✅      |
| `LET`            | Statement   | ✅      | ✅      |
| `LINE` Graphics  | Statement   | ✅      | ⛔      |
| `LINE INPUT`     | Statement   | ✅      | ✅      |
| `LIST`           | Keyword     | ✅      | ⛔      |
| `LOC`            | Function    | -       | ✅      |
| `LOCATE`         | Statement   | ✅      | ⛔      |
| `LOCK`           | Statement   | ✅      | ⛔      |
| `LOF`            | Function    | -       | ✅      |
| `LOG`            | Function    | -       | ✅      |
| `LONG`           | Keyword     | ✅      | ✅      |
| `LOOP`           | Keyword     | ✅      | ✅      |
| `LPOS`           | Function    | -       | ⛔      |
| `LPRINT`         | Statement   | ✅      | ✅      |
| `LPRINT USING`   | Statement   | ✅      | ✅      |
| `LSET`           | Statement   | ✅      | ⛔      |
| `LTRIM$`         | Function    | -       | ✅      |
| `MID$`           | Function    | ✅      | ✅      |
| `MID$`           | Statement   | ✅      | ⛔      |
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
| `OFF`            | Keyword     | ✅      | 🚧      |
| `ON COM`         | Statement   | ✅      | ⛔      |
| `ON ERROR`       | Statement   | ✅      | ⛔      |
| `ON`             | Keyword     | ✅      | 🚧      |
| `ON KEY`         | Statement   | ✅      | ⛔      |
| `ON PEN`         | Statement   | ✅      | ⛔      |
| `ON PLAY`        | Statement   | ✅      | ⛔      |
| `ON STRIG`       | Statement   | ✅      | ✅      |
| `ON TIMER`       | Statement   | ✅      | ✅      |
| `ON`...`GOSUB`   | Statement   | ✅      | ✅      |
| `ON`...`GOTO`    | Statement   | ✅      | ✅      |
| `OPEN`           | Statement   | ✅      | 🚧      |
| `OPEN COM`       | Statement   | ✅      | ⛔      |
| `OPTION BASE`    | Statement   | ✅      | ✅      |
| `OR`             | Operator    | ✅      | ✅      |
| `OUT`            | Statement   | -       | ⛔      |
| `OUTPUT`         | Keyword     | ✅      | ✅      |
| `PAINT`          | Statement   | ✅      | ⛔      |
| `PALETTE`        | Statement   | ✅      | ⛔      |
| `PALETTE USING`  | Statement   | ✅      | ⛔      |
| `PCOPY`          | Statement   | -       | ⛔      |
| `PEEK`           | Function    | -       | ⛔      |
| `PEN`            | Function    | ✅      | ⛔      |
| `PEN`            | Statement   | ✅      | ⛔      |
| `PLAY`           | Function    | ✅      | ⛔      |
| `PLAY`           | Statement   | ✅      | ⛔      |
| `PLAY` Events    | Statement   | ✅      | ⛔      |
| `PMAP`           | Function    | -       | ⛔      |
| `POKE`           | Statement   | -       | ⛔      |
| `POS`            | Function    | -       | ⛔      |
| `PRESET`         | Statement   | ✅      | ⛔      |
| `PRINT`          | Statement   | ✅      | ✅      |
| `PRINT USING`    | Statement   | ✅      | ✅      |
| `PSET`           | Statement   | ✅      | ⛔      |
| `PUT` I/O        | Statement   | ✅      | ⛔      |
| `PUT` Graphics   | Statement   | ✅      | ⛔      |
| `RANDOM`         | Keyword     | ✅      | ✅      |
| `RANDOMIZE`      | Statement   | -       | ⛔      |
| `READ`           | Statement   | ✅      | ✅      |
| `REDIM`          | Statement   | ✅      | ⛔      |
| `REM`            | Statement   | ✅      | ✅      |
| `RESET`          | Statement   | -       | ⛔      |
| `RESTORE`        | Statement   | ✅      | ✅      |
| `RESUME`         | Statement   | ✅      | ⛔      |
| `RETURN`         | Statement   | ✅      | ✅      |
| `RIGHT$`         | Function    | -       | ✅      |
| `RMDIR`          | Statement   | -       | ✅      |
| `RND`            | Function    | -       | ⛔      |
| `RSET`           | Statement   | ✅      | ⛔      |
| `RTRIM$`         | Function    | -       | ✅      |
| `RUN`            | Statement   | ⛔      | ⛔      |
| `SCREEN`         | Function    | ✅      | ⛔      |
| `SCREEN`         | Statement   | ✅      | ⛔      |
| `SEEK`           | Function    | ✅      | ✅      |
| `SEEK`           | Statement   | ✅      | ✅      |
| `SELECT CASE`    | Statement   | ✅      | ✅      |
| `SGN`            | Function    | -       | ✅      |
| `SHARED`         | Statement   | ✅      | 🚧      |
| `SHELL`          | Statement   | -       | ⛔      |
| `SIN`            | Function    | -       | ✅      |
| `SINGLE`         | Keyword     | ✅      | ✅      |
| `SLEEP`          | Statement   | -       | ✅      |
| `SOUND`          | Statement   | -       | ⛔      |
| `SPACE$`         | Function    | -       | ✅      |
| `SPC`            | Function    | ✅      | ✅      |
| `SQR`            | Function    | -       | ✅      |
| `STATIC`         | Statement   | ✅      | 🚧      |
| `$STATIC`        | Metacommand | ✅      | ✅      |
| `STEP`           | Keyword     | ✅      | ✅      |
| `STICK`          | Function    | -       | ✅      |
| `STOP`           | Statement   | ✅      | ⛔      |
| `STR$`           | Function    | -       | 🚧      |
| `STRIG`          | Function    | ✅      | ✅      |
| `STRIG`          | Statement   | ✅      | ✅      |
| `STRING`         | Keyword     | ✅      | ✅      |
| `STRING$`        | Function    | -       | ✅      |
| `SUB`            | Statement   | ✅      | ✅      |
| `SWAP`           | Statement   | ✅      | ✅      |
| `SYSTEM`         | Statement   | -       | ⛔      |
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
| `VARPTR`         | Function    | -       | ⛔      |
| `VARPTR$`        | Function    | -       | ⛔      |
| `VARSEG`         | Function    | -       | ⛔      |
| `VIEW`           | Statement   | ✅      | ⛔      |
| `VIEW PRINT`     | Statement   | ✅      | ⛔      |
| `WAIT`           | Statement   | -       | ⛔      |
| `WEND`           | Keyword     | ✅      | ✅      |
| `WHILE`...`WEND` | Statement   | ✅      | ✅      |
| `WIDTH`          | Statement   | ✅      | ⛔      |
| `WINDOW`         | Statement   | ✅      | ⛔      |
| `WRITE`          | Statement   | ✅      | ⛔      |
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
computer, and some are truly DOS specific.  How should all this behave?

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

## Low-level memory commands

- `CALL ABSOLUTE`: jumps to a machine code subroutine.
- `VARPTR` and `VARSEG`: find variables in memory.
- `PEEK` and `POKE`: examine and change memory.
- `BSAVE` and `BLOAD`: block copies in memory.
- `FRE`: report and control dynamic memory allocation.

Among other things, this means the exact representation of data is
exposed to the program.

# References

- [QBasic help file](https://scruss.com/qbasic_hlp/T0002.html)
- [QuickBasic help file](https://hwiegman.home.xs4all.nl/qb45-man/index.html)
- [Example programs](https://github.com/InsaneJetman/classic-qbasic)
- Tested against MS-DOS QBasic 1.1
