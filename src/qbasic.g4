grammar qbasic;

program : line* EOF ;

line : label? statement (':' statement)* NL
     ;

label : line_number
      | text_label ':'
      ;

statement : 'goto' label
// Statements can be empty after line labels, before or between :
          |
          ;

line_number : LINE_NUMBER ;
text_label : TEXT_LABEL ;

LINE_NUMBER : [1-9][0-9]* ;
TEXT_LABEL : [A-Za-z][A-Za-z0-9]* ;
ID : [A-Za-z][A-Za-z0-9]* ;
NL : '\r'? '\n' ;
WS : [ \t]+ -> skip ;