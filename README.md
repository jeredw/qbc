# qbc

This repository contains a reconstructed grammar and tools for the MS-DOS QBasic
1.1 language.

# Formalizing QBasic

## IDE behaviors

QBasic uses an IDE that automatically formats code as you type, so it unclear
what lexical rules a modern grammar should apply.  It could either accept the
formatted language the IDE outputs, or it could accept whatever the IDE accepts
as input.

If you run a saved program from the MS-DOS command-line with `QBASIC.EXE /RUN`,
the IDE will format it before running.  People may well have saved QBasic
programs - presumably on rotting floppy disks in dank basements - with relaxed
formatting, which `QBASIC.EXE` would run correctly (if they could read the
disks).

So it seems nicer for the grammar and tools to accept whatever the IDE would
accept.

### So is QBasic case-sensitive?

Kinda yes.  The IDE automatically converts keywords to uppercase, and it
converts identifiers and labels to the same case as their first definition.
This grammar matches keywords and identifiers in any case.  Tools ignore case
for labels and variables, so `A$` and `a$` are the same.

## Environment limits

QBasic limits variable name lengths, string lengths, ranges of datatypes, sizes
of arrays, and DOS stuff like path lengths and the number of file handles.  Most
of these limits are preserved because they can affect program behavior via `ON
ERROR`.  For example,

```
ON ERROR GOTO overflow
a% = 32767 + 1
PRINT "no overflow"
END
overflow: PRINT "overflow": END
```

should print "overflow".

## References

- [QBasic help file](https://scruss.com/qbasic_hlp/T0002.html)
- [QuickBasic help file](https://hwiegman.home.xs4all.nl/qb45-man/index.html)
- Tested against MS-DOS QBasic 1.1
