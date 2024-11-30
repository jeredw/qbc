' $STATIC
' $STATICfoo
' $STATIC foo bar
' not $STATIC foo bar
rem  $STATIC
print "hi"  ' $STATIC
print "hi": rem $STATIC
' $DYNAMIC
' $DYNAMICfoo
' $DYNAMIC foo bar
' not $DYNAMIC foo bar
rem  $DYNAMIC
print "hi"  ' $DYNAMIC
print "hi": rem $DYNAMIC
