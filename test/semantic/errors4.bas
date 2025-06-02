function stuff
  on error goto handler
  print 1/0
  stuff = 42
end function

print stuff
end

handler:
resume next