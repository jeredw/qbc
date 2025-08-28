' Test that wrapped results aren't written back after arithmetic overflow.
on error goto foo
a% = 42
a% = 32767 + 100
print a%
end
foo: resume next