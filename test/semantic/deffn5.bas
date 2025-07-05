' static variables inside deffns are not in the global scope (but are static).
def fna
  static i
  print i  ' 0 on the first call, 11 next call.
  for i = 1 to 10: next i
end def
print fna, i  ' 0 0 (i here is global)
print fna