on error goto handler
print 1/0
print 1/0
print "ok"
end

handler:
print "handler"
on error goto elsewhere
resume next

elsewhere:
print "elsewhere"
resume next