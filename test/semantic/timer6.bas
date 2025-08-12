' Check that timer returns a single by checking that atn(timer)
' only prints 7 digits of precision.
'time$ = "12:00"
' For test harness we just step the timer
timer step
print atn(timer)