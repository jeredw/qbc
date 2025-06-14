' Bug: Character cells too wide leaving behind overdraw junk
cls
screen 0
width 80, 43
locate 1,1: print string$(50, 223)
locate 2,1: print string$(50, 223)
' Should completely erase the bar drawn at 2,1.
locate 2,1: print string$(50, 32)