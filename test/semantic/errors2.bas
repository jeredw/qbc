on error goto handler
print 1/0
print "nope"
end

handler:
on error goto 0
resume next