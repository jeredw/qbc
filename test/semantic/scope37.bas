' Ok for statics to shadow shared globals or constants.
common shared x%
const k% = 10

sub foo
  static x%
  x% = x% + 1
  print x%
end sub

sub bar
  static k%
  k% = k% + 1
  print x%
end sub
  
x% = 42
foo 
foo 
foo 
bar