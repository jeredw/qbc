' Bug: passing references to array reference params.
sub g(a())
  print a(1)
end sub

sub f(a())
  g a()
end sub

dim a(80)
a(1) = 42
f a()