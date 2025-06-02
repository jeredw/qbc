on error goto handler
print err
print 1/0
print err
end
handler:
print err
resume next