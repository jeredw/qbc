' Test that argument to space$ is an integer.
on error goto check
s$ = space$(&h7fff + 1)  ' Should overflow.
end
check:
print "ok"; err
resume next