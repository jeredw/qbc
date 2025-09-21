' Test overflow during 16-bit division.
' QBasic treats this as division by 0.
print &h8000 \ -1