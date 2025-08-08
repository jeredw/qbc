' Test that you can use a function result variable as a for loop index.
function foo
  for foo = 1 to 10: next foo
end function

print foo