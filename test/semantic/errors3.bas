on error goto handler
print 1/0
on error goto 0
print 1/0
end

handler:
resume next