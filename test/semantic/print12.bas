' Test print using example from help file.
X = 441.2318

PRINT USING "The number with 3 decimal places ###.###";X
PRINT USING "The number with a dollar sign $$##.##";X
PRINT USING "The number in exponential format #.###^^^^";X
' Note that 99.9 gets rounded up to 100 because there is no fraction
' part in its fixed format field.
PRINT USING "Numbers with plus signs +###  "; X; 99.9