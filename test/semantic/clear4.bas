' Test that clear resets dynamic array descriptors.
redim a(40)
a(40) = 42
print a(40)
clear
' Should fail with "Subscript out of range" because the descriptor for a got
' clobbered.
print a(40)