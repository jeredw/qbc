' Constant can't shadow a variable in local scope.
sub foo
  dim k
  ' Duplicate definition
  const k = 42
end sub