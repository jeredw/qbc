' def fns cannot be recursive.
def fnfoo
  ' Fails with "Function not defined" at parse time.
  print fnfoo
end def