' Constants can be scoped to procedures.
declare sub bar
const foo = 42
print foo, local  ' local here is an implicit variable = 0.
bar

sub bar
  const foo = 1
  const local = 2
  print foo, local  ' foo shadows the global foo.
end sub