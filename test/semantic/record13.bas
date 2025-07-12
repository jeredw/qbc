' Bug: Look up using sigil on element name for record arrays.
type thing
  s as string * 20
end type
dim shared stuff(10) as thing
sub foo
  stuff(0).s$ = "hello"
  print stuff(0).s$
end sub
foo