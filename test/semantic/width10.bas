' Test peeking into bios data area to get current column count.
def seg = &h40
print peek(&h4a)