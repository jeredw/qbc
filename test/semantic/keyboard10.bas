' Test that keyboard shift state can be read from BIOS memory.
def seg = 0
print peek(&h417)  ' 9: alt pressed + right shift pressed
print peek(&h418)  ' 2: left alt pressed