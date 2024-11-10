grammar qbasic;

program : line* EOF ;

// Lines have an optional label, then one or more : separated statements.
line : (line_number | text_label ':')? statement (':' statement)* NL ;

statement
// REM style comments start wherever a statement begins and consume the rest of the line
// We just include them in the parse tree and ignore them.
  : 'rem' (~NL)*
  | 'goto' (line_number | text_label)
// Statements can be empty after line labels, before or between :.
  |
  ;

line_number : LINE_NUMBER ;
text_label : TEXT_LABEL ;

COMMENT : '\'' ~[\r\n]* '\r'? '\n' -> skip;
LINE_NUMBER : [1-9][0-9]* ;
TEXT_LABEL : [A-Za-z][A-Za-z0-9]* ;
ID : [A-Za-z][A-Za-z0-9]* ;
NL : '\r'? '\n' ;
WS : [ \t]+ -> skip ;