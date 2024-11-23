sub foo (bar$, baz as string, quux) static
end sub
sub bar(a, b, c%): end sub
sub baz: end sub: print "wow"
sub quux static
end sub
sub quux2: print "hi"
print "stuff": end sub
sub empty(): end sub
'fixed by ide but not matched by this grammar
'if 42 then
'  sub wow
'  end sub
'end if
'
'error:
'sub foo (a as string*40)
'end sub
