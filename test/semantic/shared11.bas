' Bug: Shared array can have same name as local scalar.
declare sub foo

dim shared m%(6, 2)
foo
print m%(1,1)
end

sub foo
  m% = 42
  m%(1, 1) = 42
end sub