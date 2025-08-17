' Implicitly defined arrays ok in DEF FN and static procs.
sub foo static
  x%(0) = 42
end sub

def fnbar
  t(3) = 4
end def

foo
print fnbar