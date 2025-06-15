' Test TAB() and SPC() formatting within PRINT.
PRINT "0        1         2         3         4         5         6         7         8"
PRINT "12345678901234567890123456789012345678901234567890123456789012345678901234567890"
PRINT "hi"; TAB(2); "ho"; TAB(200); "ok"
PRINT "---1"; TAB(90); "---2"
PRINT "|"; TAB(80); "|"
PRINT TAB(0); "!"; TAB(2); "hello"
PRINT SPC(-10); "!"; SPC(100); "!"
PRINT "hello"; SPC(2); "ho"; SPC(100); "yo"; SPC(79); "ho"