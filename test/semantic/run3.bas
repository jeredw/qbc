' Test that run with an invalid file causes an error.
on error goto errhandler
run "error"
end
errhandler:
print "ok"
resume next