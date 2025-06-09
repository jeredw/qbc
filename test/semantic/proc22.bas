' Bug: only compile nested function calls once...
function f(calls%)
  f = calls%
end function

function g
  static calls%
  calls% = calls% + 1
  g = calls%
end function

' This should print 1 not 2.
' We visit "f(g)", compile a call to g, then pop up and call f.
' f separately compiles each of its argument expressions, but
' we should avoid recompiling the call to g().
print f(f(f(g)))