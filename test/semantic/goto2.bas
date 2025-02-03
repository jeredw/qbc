gosub foo
print i
end

foo:
  i = i + 1
  if i < 10 then gosub bar
  return

bar:
  i = i + 2
  if i < 10 then gosub foo
  return