' Bug: Test that printing multiline strings wraps correctly.
cls
screen 0
locate 11, 25
Tabs$ = SPACE$(16)
Msg$ = Tabs$ + "Stuff and things" + CHR$(13)
Msg$ = Msg$ + Tabs$ + "Hooray" + CHR$(13)
Msg$ = Msg$ + Tabs$ + "This is aligned text"
Msg$ = Msg$ + CHR$(13) + Tabs$ + "More here"
Msg$ = Msg$ + CHR$(13) + Tabs$ + "|"
print Msg$