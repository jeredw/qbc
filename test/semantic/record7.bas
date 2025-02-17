type foo
  x as string * 42
end type

sub bar(p as foo)
  print p.x
  p.x = "happy"
end sub

dim blah(10) as foo
blah(2).x = "hello"
bar blah(2)
print blah(2).x