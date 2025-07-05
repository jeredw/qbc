' static declarations in procedures shadow global variables.
dim shared i as string
function test
  static i as integer
  i = i + 1
  test = i
end function
print test
print test
print test