' Bug: Should be able to redim an array after a static declaration.
sub foo
  static stuff() as string * 16
  redim stuff(10, 10) as string * 16
end sub

foo