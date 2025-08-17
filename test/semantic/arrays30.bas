' Bug: Arrays declared first in COMMON should be assumed dynamic.
common a()

sub foo (x())
  ' Should work fine since a() is dynamic.
  redim x(50)
end sub

dim a(20)
foo a()
print ubound(a)