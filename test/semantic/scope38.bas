' Bug: QBasic seems to allow parameters to shadow function names if the
' shadowed functions are declared.
declare function bar ()
declare function foo (bar)

print foo(42)

function bar: end function
function foo (bar)
foo = bar
end function