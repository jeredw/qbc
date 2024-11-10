# qbc

This repository contains a reconstructed grammar and tools for the MS-DOS QBasic
1.1 language.

## IDE behaviors

QBasic uses an IDE that automatically formats code as you type, so some lexical
behavior is part of the editor.  This makes it unclear what a modern grammar for
the language should accept.  It could match the language the IDE outputs, or it
could match whatever the IDE allows as input.

If you run a saved program from the MS-DOS command-line with `QBASIC /RUN`, the
IDE formats it before running it.  So this means people may well have saved
QBasic programs - presumably on rotting floppy disks in dank basements - with
relaxed formatting, which would run correctly if they could read the disks.

So it seems nicer for the grammar to accept whatever the IDE would allow.

## The big debate: Case sensitivity

The IDE automatically converts keywords to uppercase, and converts identifiers
and labels to the same case as their first definition.  This grammar matches
keywords and identifiers in any case, and symbol tables should ignore label and
variable case.

## References

- [QBasic help file](https://scruss.com/qbasic_hlp/T0002.html)
- [QuickBasic help file](https://hwiegman.home.xs4all.nl/qb45-man/index.html)
- Tested against MS-DOS QBasic 1.1
