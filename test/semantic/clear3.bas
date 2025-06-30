' Test that clear pops the gosub stack.
gosub foo
print "nope"
end
foo:
  clear
  ' Should fail with "RETURN without GOSUB"
  return