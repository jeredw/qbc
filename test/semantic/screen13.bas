' Bug: Test that SCREEN doesn't reset active/visible pages if not
' specified and mode isn't changing.
screen 7, , 0, 1
line (100, 100)-(150, 150), 2, bf
pcopy 0, 1
screen 7