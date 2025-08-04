' Bug: Test passing pointers to a dynamic array with a descriptor on the stack.
declare sub foo
declare sub bar(asegment%, aoffset%)

foo

sub foo
  ' a%() will be dynamic, and its descriptor will be on the stack for foo.
  dim a%(20)
  a%(0) = 42
  ' bar should get the descriptor from the right stack frame.
  bar varseg(a%(0)), varptr(a%(0))
end sub

sub bar(asegment%, aoffset%)
  def seg = asegment%
  print peek(aoffset%)
  def seg
end sub