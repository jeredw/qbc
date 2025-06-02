on error goto handler
gosub errorprone
print "back"
end
errorprone: print 1/0
end
handler: resume recover
recover: return