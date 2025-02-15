print cvs(chr$(0) + chr$(0) + chr$(&h80) + chr$(&h7f)) ' inf
print cvs(chr$(0) + chr$(0) + chr$(&hc0) + chr$(&h7f)) ' nan
print cvs(chr$(0) + chr$(0) + chr$(&hc0) + chr$(&hff)) ' -nan(ind)
print cvs(chr$(0) + chr$(0) + chr$(&h40) + chr$(&h0))  ' denorm
print mks$(cvs(chr$(0) + chr$(0) + chr$(&h80) + chr$(&h7f))) ' inf
print mks$(cvs(chr$(0) + chr$(0) + chr$(&hc0) + chr$(&h7f))) ' nan
print mks$(cvs(chr$(0) + chr$(0) + chr$(&hc0) + chr$(&hff))) ' nan
print mks$(cvs(chr$(0) + chr$(0) + chr$(&h40) + chr$(&h0)))  ' denorm