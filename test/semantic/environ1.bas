' Test looking up environment variables.
print environ$("BLASTER")
print environ$("PATH")
print environ$("BOGUS")
print environ$(1)
print environ$(2)
print environ$(3)