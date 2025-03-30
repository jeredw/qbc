TYPE TwoString
   StrFld AS STRING * 2
END TYPE

TYPE ThreeString
   StrFld AS STRING * 3
END TYPE
DIM RecOne AS TwoString, RecTwo AS ThreeString

RecOne.StrFld = "XY"
RecTwo.StrFld = "ABC"
PRINT RecOne.StrFld, RecTwo.StrFld
LSET RecOne = RecTwo
PRINT RecOne.StrFld, RecTwo.StrFld