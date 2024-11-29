  TYPE TwoString
     StrFld AS STRING * 2
  END TYPE
  TYPE ThreeString
     StrFld AS STRING * 3
  END TYPE
  DIM RecOne AS TwoString, RecTwo AS ThreeString
  LSET RecOne = RecTwo
