on error goto handler
print 1/0
print "nope"
end

handler:
print "(not) handling it"
print 1/0
resume next