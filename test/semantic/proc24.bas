' Bug: passing references to array reference params (stack ref).
sub h(a())
  print a(1)
end sub

sub g(a())
  h a()
end sub

sub f
  dim a(80)
  a(1) = 42
  g a()
end sub

f