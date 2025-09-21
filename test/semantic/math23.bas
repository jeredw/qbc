' Test overflow during 32-bit division.
' QBasic doesn't detect this.
print &h80000000 \ -1