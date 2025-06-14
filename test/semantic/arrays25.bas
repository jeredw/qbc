' Bug: Should be able to use constants to dimension static arrays.
const wellwidth = 10
const wellheight = 21
dim shared wellblocks(wellwidth, wellheight) as integer
' Should fail with Duplicate definition because wellblocks is static.
dim wellblocks(10, 10) as integer