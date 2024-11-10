grammar qbasic;

program : line* EOF ;

// Lines have an optional label, then one or more : separated statements.
line : (line_number | text_label ':')? statement (':' statement)* NL ;

statement
  : rem_statement
  | goto_statement
  | print_statement
  | print_using_statement
// Statements can be empty after line labels, before or between :.
  |
  ;

// REM style comments start wherever a statement begins and consume the rest of the line
// We just include them in the parse tree and ignore them.
rem_statement
  : 'rem' (~NL)*
  ;

goto_statement
  : 'goto' (line_number | text_label)
  ;

// PRINT accepts an optional file handle and then zero or more expressions,
// separated by a ',' or ';'. There can be a trailing ',' or ';' even if
// there is no expression.
print_statement
  : 'print' (file_number ',')? print_args (',' | ';')?
  ;

print_args
  : expr
  | expr (',' | ';') print_args
  |
  ;

// PRINT USING must use ';' expression separators - the IDE auto-corrects
// ',' to ';'. The USING format string must always be followed by ';'.
print_using_statement
  : 'print' (file_number ',')? 'using' (string_var | STRING) ';' print_using_args ';'?
  ;

print_using_args
  : expr
  | expr ';' print_using_args
  |
  ;

// A file number can be any expression that evaluates to a valid file handle
file_number : '#' expr ;

expr
   : INT
   | STRING
   ;

// Typed string variable
string_var
   : ID '$'
   ; 

line_number : INT ;
text_label : ID ;

// The IDE strips leading zeros off of numbers.
INT : [1-9][0-9]* ;

STRING : '"' ~["\r\n]* '"' ;

// Note: We skip ' comments here, but REM comments are parsed as statements.
COMMENT : '\'' ~[\r\n]* '\r'? '\n' -> skip;

ID : [A-Za-z][A-Za-z0-9.]* ;
NL : '\r'? '\n' ;
WS : [ \t]+ -> skip ;