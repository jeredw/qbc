' Bug: CVI/CVL should be signed and not overflow.
print cvi(chr$(255) + chr$(255))
print cvl(chr$(255) + chr$(255) + chr$(255) + chr$(255))