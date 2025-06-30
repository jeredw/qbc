' Test that clear inside a procedure fails at runtime.
sub foo
  ' Should fail with "Illegal function call".
  clear
end sub
foo