' Variables are global in deffns, but local in other procedures.
j = 1
def fnfoo
  fnfoo = j  ' refers to global j
end def
function test
  test = j   ' local shadows unshared global j
end function
print fnfoo
print test