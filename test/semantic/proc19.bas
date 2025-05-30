type test
  x as integer
  stuff as integer
end type

sub dostuff(thing%)
print thing%
thing% = 42
end sub

dim t as test
t.stuff = 41
dostuff t.stuff
print t.stuff