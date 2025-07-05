' Constants can be scoped to deffns.
const k = 0
def fnfoo
  const k = 42  ' shadows global k
  fnfoo = k
end def

const k2 = 42
function test
  test = k2  ' implicit global scope
end function

print fnfoo
print test