' Test logical operators using example from manual.
declare sub TruthTable(x!, y!)
print " X       Y      NOT     AND     OR      ";
print "XOR     EQV     IMP"
print
I = 10 : J = 15
X = (I = 10) : Y = (J = 15)  'X is true (-1); Y is true (-1)
call TruthTable (X,Y)
X = (I > 9) : Y = (J > 15)   'X is true (-1); Y is false (0)
call TruthTable (X,Y)
X = (I <> 10) : Y = (J < 16) 'X is false (0); Y is true (-1)
call TruthTable (X,Y)
X = (I < 10) : Y = (J < 15)  'X is false (0); Y is false (0)
call TruthTable (X,Y)
end

sub TruthTable(X,Y) STATIC
print X "    " Y "    ";NOT X "   " X AND Y "     " X OR Y;
print "    " X XOR Y "    " X EQV Y "    " X IMP Y
print
end sub