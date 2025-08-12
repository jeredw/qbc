' Test that polymorphic numeric functions return their argument type.
' Check the number of digits in the atn result to verify that single -> single
' and double -> double.
' Check that the result times an integer overflows integer or long bounds to
' verify that integer -> integer and long -> long.
on error goto ok
print abs(&h7fff) * 2
print abs(&h7fffffff) * 2
print atn(abs(1!))
print atn(abs(1#))
print fix(&h7fff) * 2
print fix(&h7fffffff) * 2
print atn(fix(1!))
print atn(fix(1#))
print int(&h7fff) * 2
print int(&h7fffffff) * 2
print atn(int(1!))
print atn(int(1#))
print sgn(-1) * &h8000
print sgn(-1&) * &h80000000
print atn(sgn(1!))
print atn(sgn(1#))
end
ok: print "ok"; err
resume next