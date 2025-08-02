' Test that the F11 key works.
do: a$ = inkey$: loop while a$ = ""
print asc(a$); asc(mid$(a$, 2, 1))