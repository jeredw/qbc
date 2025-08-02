' Test that the last keypress can be read from BIOS memory.
def seg = 0
print peek(&h417)
print peek(&h418)