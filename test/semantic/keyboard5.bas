key 15, chr$(128) + chr$(79)
on key(15) gosub hi
key(15) on
key(15) step
end
hi: print "end": return